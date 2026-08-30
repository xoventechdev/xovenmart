package com.xovenmart.android.data.network

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import retrofit2.HttpException
import java.io.IOException

/**
 * Typed app errors. ViewModels branch on [kind] for retry / re-auth /
 * show-banner behavior. We deliberately drop the raw exception from
 * the public surface so users never see a stack trace.
 */
sealed class AppError(message: String, cause: Throwable? = null) : Exception(message, cause) {
    abstract val kind: Kind

    enum class Kind { Network, Server, Validation, Auth, Unknown }

    class Network(message: String, cause: Throwable? = null) :
        AppError(message, cause) { override val kind = Kind.Network }

    class Server(val code: Int, message: String, cause: Throwable? = null) :
        AppError(message, cause) { override val kind = Kind.Server }

    /** 4xx with a server-supplied machine-readable code (e.g. `USER_NOT_FOUND`). */
    class Validation(val serverCode: String?, message: String, cause: Throwable? = null) :
        AppError(message, cause) { override val kind = Kind.Validation }

    /** 401 — credentials are bad/expired; the nav graph should re-route to login. */
    class Auth(message: String, cause: Throwable? = null) :
        AppError(message, cause) { override val kind = Kind.Auth }

    class Unknown(message: String, cause: Throwable? = null) :
        AppError(message, cause) { override val kind = Kind.Unknown }
}

private val json = Json { ignoreUnknownKeys = true }

@kotlinx.serialization.Serializable
private data class ServerErrorEnvelope(
    val message: String? = null,
    val error: String? = null,
    val code: String? = null,
)

/**
 * Map any thrown exception during a Retrofit call into an [AppError].
 * The repositories wrap every API call with this so ViewModels see a
 * narrow surface.
 */
fun Throwable.toAppError(): AppError = when (this) {
    is AppError -> this
    is HttpException -> mapHttp(this)
    is IOException   -> AppError.Network(message ?: "Network error", this)
    is SerializationException -> AppError.Unknown("Bad response shape", this)
    else -> AppError.Unknown(message ?: "Unexpected error", this)
}

private fun mapHttp(e: HttpException): AppError {
    val raw = runCatching { e.response()?.errorBody()?.string() }.getOrNull()
    val parsed = raw?.let { runCatching { json.decodeFromString(ServerErrorEnvelope.serializer(), it) }.getOrNull() }
    val msg = parsed?.message ?: parsed?.error ?: e.message()
    return when (e.code()) {
        400, 422 -> AppError.Validation(parsed?.code, msg ?: "Invalid request", e)
        401      -> AppError.Auth(msg ?: "Authentication required", e)
        in 500..599 -> AppError.Server(e.code(), msg ?: "Server error", e)
        else     -> AppError.Unknown(msg ?: "Request failed (${e.code()})", e)
    }
}