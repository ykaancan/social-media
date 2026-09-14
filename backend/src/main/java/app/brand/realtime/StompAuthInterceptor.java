package app.brand.realtime;

import app.brand.event.EventMemberRepository;
import app.brand.security.JwtService;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

/**
 * The whole authorisation story of the realtime layer [B12].
 *
 * <p>{@code CONNECT} carries the same bearer token as every HTTP call [B3]. It is
 * verified here, the {@code app_user} row is read live (so a ban or a deletion
 * ends the socket's next connect attempt, never waits out the token), and the
 * session's {@link Principal} name is set to the user id string — which is what
 * makes {@code /user/queue/**} resolve for {@link InvalidationPublisher}.
 *
 * <p>{@code SUBSCRIBE} is checked per destination:
 * <ul>
 *   <li>{@code /topic/events/{id}/board} — members of that board only.</li>
 *   <li>{@code /user/queue/events/{id}} and {@code /user/queue/threads} — any
 *       authenticated connection: a user destination reaches exactly one
 *       principal, so these are private by construction and there is nothing to
 *       check.</li>
 *   <li>anything else — refused.</li>
 * </ul>
 *
 * <p>Every refusal is the same refusal. A board that does not exist and a board
 * the caller is not in must be indistinguishable, exactly as {@code GET /events/{id}}
 * answers 404 for both [B14].
 *
 * <p>What the client sees on a refusal: the frame is never delivered, the server
 * writes a STOMP {@code ERROR} frame and closes the socket. {@code @stomp/stompjs}
 * reports it through {@code onStompError} and then reconnects on its 5 s timer —
 * which is the behaviour we want for an expired token, since the app will have
 * refreshed it by then.
 */
@Component
public class StompAuthInterceptor implements ChannelInterceptor {

    private static final Logger log = LoggerFactory.getLogger(StompAuthInterceptor.class);

    private static final String BEARER = "Bearer ";
    private static final String AUTHORIZATION = "Authorization";

    private static final String UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
    private static final Pattern BOARD_TOPIC = Pattern.compile("^/topic/events/(" + UUID_PATTERN + ")/board$");
    private static final Pattern OWN_EVENT_QUEUE = Pattern.compile("^/user/queue/events/" + UUID_PATTERN + "$");
    private static final String THREADS_QUEUE = "/user/queue/threads";

    private final JwtService jwtService;
    private final AppUserRepository users;
    private final EventMemberRepository members;

    public StompAuthInterceptor(JwtService jwtService, AppUserRepository users, EventMemberRepository members) {
        this.jwtService = jwtService;
        this.users = users;
        this.members = members;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) {
            // A heartbeat or a non-STOMP message. Nothing to decide.
            return message;
        }
        switch (accessor.getCommand()) {
            case CONNECT, STOMP -> accessor.setUser(authenticate(accessor));
            case SUBSCRIBE -> authorise(accessor);
            // Stage 1 has no client-to-server messaging: the app subscribes and
            // refetches over HTTP, and /app has no handlers. A SEND is either a
            // bug or a probe.
            case SEND -> refuse(accessor.getCommand());
            default -> { }
        }
        return message;
    }

    /* --------------------------------------------------------------- CONNECT */

    private Principal authenticate(StompHeaderAccessor accessor) {
        AppUser user = bearer(accessor)
                .flatMap(jwtService::subject)
                .flatMap(users::findById)
                // [D7] pending means the account cannot use the app yet, and a
                // banned or rejected one never can.
                .filter(candidate -> candidate.getStatus() == AccountStatus.APPROVED)
                .orElseThrow(() -> {
                    log.debug("refused STOMP CONNECT: no approved account behind the bearer");
                    return new RealtimeRefusedException("unauthorized");
                });
        log.debug("STOMP CONNECT accepted for {}", user.getId());
        return new ConnectedUser(user.getId().toString());
    }

    private static Optional<String> bearer(StompHeaderAccessor accessor) {
        @SuppressWarnings("unchecked")
        Map<String, List<String>> native_ = (Map<String, List<String>>) accessor.getHeader(
                StompHeaderAccessor.NATIVE_HEADERS);
        if (native_ == null) {
            return Optional.empty();
        }
        return native_.entrySet().stream()
                // stompjs sends "Authorization"; a header name is not
                // case-sensitive anywhere else in this server either.
                .filter(entry -> AUTHORIZATION.equalsIgnoreCase(entry.getKey()))
                .map(Map.Entry::getValue)
                .filter(values -> values != null && !values.isEmpty())
                .map(values -> values.get(0))
                .filter(value -> value != null && value.startsWith(BEARER))
                .map(value -> value.substring(BEARER.length()).trim())
                .filter(token -> !token.isEmpty())
                .findFirst();
    }

    /* ------------------------------------------------------------- SUBSCRIBE */

    private void authorise(StompHeaderAccessor accessor) {
        Principal user = accessor.getUser();
        String destination = accessor.getDestination();
        if (user == null || destination == null) {
            refuse(StompCommand.SUBSCRIBE);
        }
        if (THREADS_QUEUE.equals(destination) || OWN_EVENT_QUEUE.matcher(destination).matches()) {
            // Private by construction: a user destination is delivered only to the
            // sessions of the principal it names.
            return;
        }
        Matcher board = BOARD_TOPIC.matcher(destination);
        if (!board.matches()) {
            refuse(StompCommand.SUBSCRIBE);
        }
        UUID eventId = UUID.fromString(board.group(1));
        UUID userId = UUID.fromString(user.getName());
        if (!members.existsByEventIdAndUserId(eventId, userId)) {
            // Same refusal whether the board is someone else's or does not exist.
            log.debug("refused SUBSCRIBE to a board {} is not in", userId);
            refuse(StompCommand.SUBSCRIBE);
        }
    }

    private static void refuse(StompCommand command) {
        log.debug("refused STOMP {}", command);
        throw new RealtimeRefusedException("not allowed");
    }

    /**
     * The session's identity. {@code getName()} is the user id string because
     * {@code convertAndSendToUser(userId.toString(), ...)} resolves user
     * destinations by principal name.
     */
    private record ConnectedUser(String name) implements Principal {

        @Override
        public String getName() {
            return name;
        }
    }
}
