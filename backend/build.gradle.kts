import org.springframework.boot.gradle.tasks.run.BootRun

plugins {
    java
    id("org.springframework.boot") version "3.5.16"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "app.brand"
version = "0.1.0-SNAPSHOT"
description = "[BRAND] backend"

java {
    // [B1] Java 21 regardless of the host JDK; foojay provisions it.
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

val jjwtVersion = "0.12.6"

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-websocket")
    implementation("org.springframework.boot:spring-boot-starter-thymeleaf")
    implementation("org.springframework.boot:spring-boot-starter-mail")
    implementation("org.springframework.boot:spring-boot-starter-actuator")

    implementation("org.flywaydb:flyway-core")
    implementation("org.flywaydb:flyway-database-postgresql")

    // [B3] access tokens
    implementation("io.jsonwebtoken:jjwt-api:$jjwtVersion")
    runtimeOnly("io.jsonwebtoken:jjwt-impl:$jjwtVersion")
    runtimeOnly("io.jsonwebtoken:jjwt-jackson:$jjwtVersion")

    // [B10] avatar resizing, used by POST /me/photo.
    implementation("net.coobird:thumbnailator:0.4.20")
    // The JDK's ImageIO reads JPEG and PNG but not WebP, which modern Android
    // pickers hand over. One reader plugin, registered by service loader.
    runtimeOnly("com.twelvemonkeys.imageio:imageio-webp:3.12.0")

    runtimeOnly("org.postgresql:postgresql")

    annotationProcessor("org.springframework.boot:spring-boot-configuration-processor")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("org.testcontainers:junit-jupiter")
    testImplementation("org.testcontainers:postgresql")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    options.compilerArgs.add("-parameters")
}

tasks.withType<Test>().configureEach {
    useJUnitPlatform()
    testLogging {
        events("failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}

// [B11] The admin page lives at /admin/index.html in the repo (CLAUDE.md's repo
// layout) and is served by this backend. Copying it into the resources output at
// build time is the whole "build step" it has: no framework, no bundler, and the
// file on disk is the file that ships.
tasks.named<ProcessResources>("processResources") {
    from(layout.projectDirectory.file("../admin/index.html")) {
        into("static/admin")
    }
}

tasks.named<BootRun>("bootRun") {
    // Local runs default to the dev profile (compose Postgres, dev-only secret).
    systemProperty("spring.profiles.active", System.getProperty("spring.profiles.active") ?: "dev")
}
