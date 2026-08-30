# ProGuard / R8 rules for the release build.
# Release isn't shipped in v1 — these rules are here so a future `assembleRelease`
# is one step away. Most concerns are already covered by the consumer rules
# shipped with Hilt, Retrofit, and Kotlinx-Serialization; the lines below are
# the few project-specific ones.

# Keep the BuildConfig API_BASE_URL field (some folks read it via reflection)
-keepclassmembers class com.xovenmart.android.BuildConfig {
    public static final java.lang.String API_BASE_URL;
    public static final java.lang.String API_ENV;
}

# Kotlinx-Serialization: keep generated $$serializer companions + the
# companion object itself. The kotlinx-serialization plugin handles most of
# this via consumer rules, but be explicit for our @Serializable types.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keep,includedescriptorclasses class com.xovenmart.android.**$$serializer { *; }
-keepclassmembers class com.xovenmart.android.** {
    *** Companion;
}
-keepclasseswithmembers class com.xovenmart.android.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# OkHttp / Retrofit are well-behaved; their consumer rules ship in the AAR.
# Nothing additional required here.
