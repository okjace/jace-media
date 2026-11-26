import java.util.Base64

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The version comes from apps/VERSION, shared by every Jace Media app.
val appVersion: String = rootProject.file("../VERSION").readText().trim()
val appVersionCode: Int = appVersion.split(".").map { it.toIntOrNull() ?: 0 }.let { (it + listOf(0, 0, 0)).take(3) }
    .let { (a, b, c) -> a * 10000 + b * 100 + c }

// Release signing: the key from packaging/android_keystore.py, given to CI as secrets. Every release must
// be signed with the same key, or Android refuses the update.
val keystoreB64: String? = System.getenv("ANDROID_KEYSTORE_B64")
val keystorePassword: String? = System.getenv("ANDROID_KEYSTORE_PASSWORD")
val keystoreFile = layout.buildDirectory.file("release.p12").get().asFile

android {
    namespace = "com.okjace.jacemedia"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.okjace.jacemedia"
        minSdk = 24
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersion
        buildConfigField("String", "SITE", "\"https://jace-media.vercel.app\"")
    }

    signingConfigs {
        if (!keystoreB64.isNullOrBlank() && !keystorePassword.isNullOrBlank()) {
            create("release") {
                keystoreFile.parentFile.mkdirs()
                keystoreFile.writeBytes(Base64.getDecoder().decode(keystoreB64.trim()))
                storeFile = keystoreFile
                storeType = "pkcs12"
                storePassword = keystorePassword
                keyAlias = "jacemedia"
                keyPassword = keystorePassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
}
