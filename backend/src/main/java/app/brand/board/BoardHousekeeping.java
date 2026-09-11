package app.brand.board;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * [B5] The two things a derived status cannot do: finalise a rejection whose
 * five-second undo window has passed [B6], and reject posts left pending on a
 * board that has closed or ended [D4].
 *
 * <p>Both are also applied lazily inside every board read and write, so this job
 * changes nothing anyone could otherwise see — it only makes the notification
 * arrive without someone opening the screen first. A stopped scheduler is a
 * delayed push, never a wrong board.
 *
 * <p>The bean exists whatever {@code brand.housekeeping.enabled} says; the
 * annotation is inert unless {@code BoardSchedulingConfig} switched scheduling on.
 * That is what lets a test call {@link #run()} at the exact instant it wants
 * instead of racing a timer.
 */
@Component
public class BoardHousekeeping {

    private static final Logger log = LoggerFactory.getLogger(BoardHousekeeping.class);

    private final BoardService board;

    public BoardHousekeeping(BoardService board) {
        this.board = board;
    }

    @Scheduled(fixedDelayString = "${brand.housekeeping.interval:5000}")
    public void run() {
        try {
            board.housekeeping();
        } catch (RuntimeException failed) {
            // A failed pass must not kill the scheduler: the next one, or the next
            // board read, applies exactly the same transitions.
            log.warn("board housekeeping pass failed", failed);
        }
    }
}
