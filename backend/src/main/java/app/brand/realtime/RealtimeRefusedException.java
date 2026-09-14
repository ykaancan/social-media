package app.brand.realtime;

/**
 * A STOMP frame the server will not accept. Thrown from
 * {@link StompAuthInterceptor}, which puts it on the client inbound channel, so
 * Spring turns it into a STOMP {@code ERROR} frame and closes the socket.
 *
 * <p>Deliberately not an {@code ApiException}: there is no HTTP status and no
 * error body here [B14], and the message is the only thing the client sees. Keep
 * every message generic — a refusal must never say whether a board exists.
 */
public class RealtimeRefusedException extends RuntimeException {

    public RealtimeRefusedException(String message) {
        super(message);
    }
}
