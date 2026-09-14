# syntax=docker/dockerfile:1
#
# [BRAND] backend image. Two stages: a JDK builds the boot jar, a JRE runs it.
#
# The build context is the REPOSITORY ROOT, not backend/, because
# processResources copies ../admin/index.html into static/admin [B11] — the
# admin page is part of the artefact, and a context that stopped at backend/
# would build an image whose /admin/ is a 404. Build it with:
#
#   docker build -f backend/Dockerfile -t brand-api:local .
#
# ---------------------------------------------------------------- build stage
FROM eclipse-temurin:21-jdk AS build

# [B1] The build asks for a Java 21 toolchain. This image *is* a Java 21 JDK, so
# the toolchain is satisfied locally; auto-download is switched off so a wrong
# base image fails loudly here instead of quietly pulling a second JDK over the
# network inside the container.
ENV GRADLE_OPTS="-Dorg.gradle.java.installations.auto-download=false"

WORKDIR /workspace/backend

# The wrapper and the build scripts change far less often than src/, so they are
# their own layers and an ordinary code edit reuses the dependency download.
COPY backend/gradlew ./gradlew
COPY backend/gradle ./gradle
COPY backend/settings.gradle.kts backend/build.gradle.kts ./
RUN chmod +x ./gradlew

RUN --mount=type=cache,target=/root/.gradle,sharing=locked \
    ./gradlew --no-daemon -q dependencies --configuration runtimeClasspath > /dev/null

# [B11] The admin page, at the path build.gradle.kts expects (../admin).
COPY admin /workspace/admin
COPY backend/src ./src

RUN --mount=type=cache,target=/root/.gradle,sharing=locked \
    ./gradlew bootJar --no-daemon \
    && cp build/libs/*.jar /workspace/app.jar

# Boot 3.5 jarmode. `tools` replaced `layertools`; `extract --layers` splits the
# fat jar into the four layers the plugin defines, so dependencies (large,
# stable) and application classes (small, every commit) land in different image
# layers. What comes out is not a fat jar: app.jar is thin and its manifest
# Class-Path points at lib/, which is why the entrypoint is a plain `java -jar`.
RUN java -Djarmode=tools -jar /workspace/app.jar extract --layers --destination /workspace/extracted

# -------------------------------------------------------------- runtime stage
# JRE, not JDK, and alpine: the Temurin musl JRE ships libawt_headless,
# libjavajpeg and libfontmanager, which is everything POST /me/photo needs to
# resize an avatar [B10] — the WebP reader plugin is pure Java. About 250 MB
# where the Ubuntu JRE is 600.
FROM eclipse-temurin:21-jre-alpine AS runtime

# curl is the HEALTHCHECK; nothing else is added.
RUN apk add --no-cache curl

# Never root. /data/avatars is a volume in production; it is created and owned
# here so the container still starts when nothing is mounted over it.
RUN addgroup -S -g 1001 brand \
    && adduser -S -u 1001 -G brand -h /app -s /sbin/nologin brand \
    && mkdir -p /app /data/avatars \
    && chown -R brand:brand /app /data

WORKDIR /app

COPY --from=build --chown=brand:brand /workspace/extracted/dependencies/ ./
COPY --from=build --chown=brand:brand /workspace/extracted/spring-boot-loader/ ./
COPY --from=build --chown=brand:brand /workspace/extracted/snapshot-dependencies/ ./
COPY --from=build --chown=brand:brand /workspace/extracted/application/ ./

USER brand

# The profile is a default, not a decision: docker compose or `docker run -e`
# overrides it. application-prod.yml is the only profile that requires secrets.
ENV SPRING_PROFILES_ACTIVE=prod

EXPOSE 8080

# /actuator/health is permitAll and exposes no details
# (management.endpoint.health.show-details: never), so it is safe to poll.
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
    CMD curl -fsS http://127.0.0.1:8080/actuator/health || exit 1

# Heap from the container limit rather than a fixed -Xmx, so the same image is
# right on a 1 GB VM and on a 4 GB one. Exec form: the JVM is PID 1 and gets the
# SIGTERM that server.shutdown=graceful is waiting for.
ENTRYPOINT ["java", \
    "-XX:MaxRAMPercentage=75", \
    "-XX:+ExitOnOutOfMemoryError", \
    "-Djava.awt.headless=true", \
    "-Duser.timezone=UTC", \
    "-jar", "app.jar"]
