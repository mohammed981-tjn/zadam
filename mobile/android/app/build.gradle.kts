plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "sd.sudagri.sudagri"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "sd.sudagri.sudagri"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    /*
     * A signing key that lives in the repository, so every build signs the same.
     *
     * Android identifies an app by package name *and* signature, and refuses to
     * install a build signed differently over one already on the device —
     * "package conflicts with an existing package". Gradle's default debug key
     * is generated per machine, so every CI run produced a new signature and
     * every update meant uninstalling first.
     *
     * This key is deliberately not a secret, and its password sits in this file
     * on purpose: it signs hand-installed builds and nothing else. Publishing to
     * a store needs an upload key that belongs to whoever owns the listing, and
     * that one must never be committed — point `release` at it when there is a
     * listing to own.
     */
    signingConfigs {
        getByName("debug") {
            storeFile = file("sudagri-debug.keystore")
            storePassword = "sudagri"
            keyAlias = "sudagri"
            keyPassword = "sudagri"
        }
    }

    buildTypes {
        release {
            // TODO: replace with a real upload key before publishing to a store.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
