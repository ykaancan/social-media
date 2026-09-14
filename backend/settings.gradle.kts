plugins {
    // [B1] The host runs JDK 25; this resolver downloads the Java 21 toolchain the
    // build asks for, so the build never depends on whichever JDK is on PATH.
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "brand-backend"
