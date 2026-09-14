package app.brand.realtime;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;

/**
 * [B12] STOMP over a raw WebSocket at {@code /ws}, Spring's simple in-memory
 * broker, one instance.
 *
 * <p>Everything here is dictated by what {@code app/src/api/http.ts} already does:
 * {@code @stomp/stompjs} 7 with no SockJS, binary frames on native, heartbeats
 * 10 s in and 10 s out. Destinations are {@code /topic/events/{id}/board},
 * {@code /user/queue/events/{id}} and {@code /user/queue/threads}; every frame
 * has an empty body and the client refetches over HTTP.
 *
 * <p>The handshake itself is {@code permitAll} in {@code SecurityConfig}; the
 * credential is the bearer token on the STOMP {@code CONNECT} frame [B3], checked
 * by {@link StompAuthInterceptor}.
 *
 * <p>*Flip if:* a second instance is deployed — then a RabbitMQ STOMP relay, and
 * {@link InvalidationPublisher} stops being enough on its own.
 */
@Configuration
@EnableWebSocketMessageBroker
public class RealtimeConfig implements WebSocketMessageBrokerConfigurer {

    /** Matches the client's {@code heartbeatIncoming}/{@code heartbeatOutgoing}. */
    private static final long HEARTBEAT_MILLIS = 10_000;

    /**
     * Frames carry no body, so nothing legitimate is large. The generous-looking
     * limit is for STOMP headers, not payload.
     */
    private static final int MESSAGE_SIZE_LIMIT = 16 * 1024;

    private static final int SEND_BUFFER_SIZE_LIMIT = 128 * 1024;

    private static final int SEND_TIME_LIMIT_MILLIS = 10_000;

    private final StompAuthInterceptor authInterceptor;
    private final RealtimeErrorHandler errorHandler;

    public RealtimeConfig(StompAuthInterceptor authInterceptor, RealtimeErrorHandler errorHandler) {
        this.authInterceptor = authInterceptor;
        this.errorHandler = errorHandler;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // No SockJS: the app speaks raw WebSocket. Native clients send no Origin
        // header at all (so the default same-origin rule would not apply to them),
        // but the Expo web preview does, and it is served from the dev server.
        registry.addEndpoint("/ws").setAllowedOriginPatterns("*");
        // A refusal says "unauthorized" or "not allowed" and nothing else.
        registry.setErrorHandler(errorHandler);
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue")
                .setHeartbeatValue(new long[] {HEARTBEAT_MILLIS, HEARTBEAT_MILLIS})
                .setTaskScheduler(stompHeartbeatScheduler());
        // Nothing is published from a client in stage 1 — StompAuthInterceptor
        // refuses SEND — but a prefix that is not the broker's keeps a stray frame
        // from ever reaching a topic.
        registry.setApplicationDestinationPrefixes("/app");
        // User destinations resolve by principal name, which is the user id
        // string; see StompAuthInterceptor.
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(authInterceptor);
    }

    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
        registration.setMessageSizeLimit(MESSAGE_SIZE_LIMIT)
                .setSendBufferSizeLimit(SEND_BUFFER_SIZE_LIMIT)
                .setSendTimeLimit(SEND_TIME_LIMIT_MILLIS);
    }

    /**
     * The broker's own scheduler, used only to write heartbeat bytes. Kept
     * separate from the application's {@code @Scheduled} pool so a slow
     * housekeeping run [B5] can never delay a heartbeat and drop live boards.
     *
     * <p>{@code defaultCandidate = false} is the other half of that: the bean is
     * reachable here by name and invisible to by-type injection, so adding it
     * cannot quietly move {@code @Scheduled} work onto this one thread.
     */
    @Bean(defaultCandidate = false)
    public TaskScheduler stompHeartbeatScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("stomp-heartbeat-");
        scheduler.setDaemon(true);
        return scheduler;
    }
}
