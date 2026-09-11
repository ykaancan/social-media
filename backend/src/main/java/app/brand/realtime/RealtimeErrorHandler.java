package app.brand.realtime;

import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.StompSubProtocolErrorHandler;

/**
 * What a refused frame says on the wire.
 *
 * <p>Without this, Spring's default ERROR frame reports the plumbing that failed
 * ("Failed to send message to ExecutorSubscribableChannel[clientInboundChannel]"),
 * which tells a developer nothing and a client even less. A
 * {@link RealtimeRefusedException} is turned into its own short message instead —
 * {@code unauthorized} or {@code not allowed}, never anything that varies with
 * the reason.
 *
 * <p>Anything that is not a deliberate refusal keeps the default text: a bug in
 * this server must not be described to a client.
 */
@Component
public class RealtimeErrorHandler extends StompSubProtocolErrorHandler {

    private static final byte[] EMPTY_PAYLOAD = new byte[0];

    @Override
    public Message<byte[]> handleClientMessageProcessingError(Message<byte[]> clientMessage, Throwable ex) {
        RealtimeRefusedException refusal = refusalIn(ex);
        if (refusal == null) {
            return super.handleClientMessageProcessingError(clientMessage, ex);
        }
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.ERROR);
        accessor.setMessage(refusal.getMessage());
        accessor.setLeaveMutable(true);
        return MessageBuilder.createMessage(EMPTY_PAYLOAD, accessor.getMessageHeaders());
    }

    private static RealtimeRefusedException refusalIn(Throwable ex) {
        for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
            if (cause instanceof RealtimeRefusedException refusal) {
                return refusal;
            }
            if (cause.getCause() == cause) {
                break;
            }
        }
        return null;
    }
}
