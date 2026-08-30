package com.xovenmart.android.data.network

import com.xovenmart.android.data.api.AuthApi
import com.xovenmart.android.data.dto.auth.RefreshRequest
import dagger.Lazy
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Single-flight refresh: when any request gets a 401, we exchange the
 * refresh token exactly once (across concurrent retries) for a new
 * access+refresh pair, swap them into [SecureTokenStore], and replay
 * the original request with the fresh token.
 *
 * On refresh failure the tokens are cleared so the nav graph can route
 * back to login on the next render.
 */
@Singleton
class RefreshAuthenticator @Inject constructor(
    private val tokens: SecureTokenStore,
    private val authApi: Lazy<AuthApi>,
) : Authenticator {

    private val mutex = Mutex()

    override fun authenticate(route: Route?, response: Response): Request? {
        // Don't loop forever — if we already attached a fresh token and
        // still got 401, give up.
        if (response.priorResponse != null) return null
        val refresh = tokens.refresh() ?: return null

        val newPair = runBlocking {
            mutex.withLock {
                // Re-read in case another coroutine refreshed while we waited.
                val current = tokens.access() ?: return@withLock null
                if (response.request.header("Authorization") == "Bearer $current") {
                    runCatching { authApi.get().refresh(RefreshRequest(refreshToken = refresh)) }
                        .onSuccess { pair ->
                            tokens.save(pair.accessToken, pair.refreshToken)
                            return@withLock pair
                        }
                        .onFailure { tokens.clear() }
                    null
                } else null
            }
        } ?: return null

        return response.request.newBuilder()
            .header("Authorization", "Bearer ${newPair.accessToken}")
            .build()
    }
}