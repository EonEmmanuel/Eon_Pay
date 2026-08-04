import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val localProperties = Properties().apply {
    val propertiesFile = rootProject.file("local.properties")
    if (propertiesFile.exists()) {
        propertiesFile.inputStream().use(::load)
    }
}

fun configuredValue(name: String): String =
    providers.gradleProperty(name).orNull
        ?: localProperties.getProperty(name)
        ?: System.getenv(name)
        ?: ""

fun quotedBuildConfig(value: String): String =
    "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

val backendBaseUrl = configuredValue("DPC_BACKEND_BASE_URL")
val policyPublicKey = configuredValue("DPC_POLICY_PUBLIC_KEY")
val apiCertificatePins = configuredValue("DPC_API_CERT_PINS")
val playIntegrityCloudProjectNumber = configuredValue("DPC_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER")
val configuredAllowedPackages = configuredValue("DPC_ALLOWED_PACKAGES")
val configuredFrpAccountIds = configuredValue("DPC_FRP_ACCOUNT_IDS")
val releaseStoreFile = configuredValue("DPC_RELEASE_STORE_FILE")
val releaseStorePassword = configuredValue("DPC_RELEASE_STORE_PASSWORD")
val releaseKeyAlias = configuredValue("DPC_RELEASE_KEY_ALIAS")
val releaseKeyPassword = configuredValue("DPC_RELEASE_KEY_PASSWORD")
val releaseSigningValues = listOf(
    releaseStoreFile,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
)
val releaseSigningConfigured = releaseSigningValues.all(String::isNotBlank)
require(releaseSigningValues.all(String::isBlank) || releaseSigningConfigured) {
    "Release signing is partially configured. Set all DPC_RELEASE_* values or none of them."
}
if (configuredFrpAccountIds.isNotBlank()) {
    require(
        configuredFrpAccountIds.split(',')
            .map(String::trim)
            .all { it.matches(Regex("^[0-9]+$")) },
    ) {
        "DPC_FRP_ACCOUNT_IDS must contain comma-separated numeric Google userIds."
    }
}
val hasFirebaseConfiguration = rootProject.file("app/google-services.json").exists()

android {
    namespace = "com.eonpay.deviceagent"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.eonpay.deviceagent"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField("String", "BACKEND_BASE_URL", quotedBuildConfig(backendBaseUrl))
        buildConfigField("String", "POLICY_PUBLIC_KEY", quotedBuildConfig(policyPublicKey))
        buildConfigField("String", "API_CERT_PINS", quotedBuildConfig(apiCertificatePins))
        buildConfigField(
            "String",
            "PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER",
            quotedBuildConfig(playIntegrityCloudProjectNumber),
        )
        buildConfigField(
            "String",
            "CONFIGURED_ALLOWED_PACKAGES",
            quotedBuildConfig(configuredAllowedPackages),
        )
        buildConfigField(
            "String",
            "FRP_ACCOUNT_IDS",
            quotedBuildConfig(configuredFrpAccountIds),
        )
        buildConfigField("boolean", "FIREBASE_CONFIGURED", hasFirebaseConfiguration.toString())

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        resourceConfigurations += listOf("en", "fr")
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    signingConfigs {
        if (releaseSigningConfigured) {
            create("release") {
                storeFile = rootProject.file(releaseStoreFile)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            if (releaseSigningConfigured) {
                signingConfig = signingConfigs.getByName("release")
            }
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources.excludes += setOf(
            "META-INF/DEPENDENCIES",
            "META-INF/LICENSE.md",
            "META-INF/NOTICE.md",
        )
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

if (hasFirebaseConfiguration) {
    apply(plugin = "com.google.gms.google-services")
    apply(plugin = "com.google.firebase.crashlytics")
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-process:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.7")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("com.google.android.material:material:1.12.0")

    implementation("com.squareup.moshi:moshi-kotlin:1.15.2")
    implementation("com.squareup.retrofit2:converter-moshi:2.11.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    implementation("com.google.crypto.tink:tink-android:1.16.0")
    implementation("com.google.android.play:integrity:1.6.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")

    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-messaging-ktx")
    implementation("com.google.firebase:firebase-installations")
    implementation("com.google.firebase:firebase-crashlytics-ktx")

    implementation("io.coil-kt:coil:2.7.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("com.squareup.moshi:moshi-kotlin:1.15.2")
}
