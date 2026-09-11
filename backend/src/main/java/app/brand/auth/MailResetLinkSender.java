package app.brand.auth;

import app.brand.config.BrandProperties;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.MessageSource;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

/**
 * Sends the reset link by SMTP when {@code brand.mail.enabled} is true, and
 * otherwise logs it at INFO.
 *
 * <p>The logged link carries a live token, so this is a development and
 * pre-launch affordance only — BACKEND_PLAN.md §6 lists SMTP credentials as one of
 * the things that need the founder. Turning mail on turns the logging off.
 *
 * <p>No log line here names the recipient: an address in a log file is personal
 * data that outlives the account (KVKK), and nothing about delivery needs it.
 *
 * <p>Subject and body are i18n, in the language the {@code forgot-password}
 * request came in with.
 */
@Component
public class MailResetLinkSender implements ResetLinkSender {

    private static final Logger log = LoggerFactory.getLogger(MailResetLinkSender.class);

    /** Subject and body, in the language of the request that asked for the link. */
    record ResetMail(String subject, String body) {
    }

    private final BrandProperties properties;
    private final ObjectProvider<JavaMailSender> mailSender;
    private final MessageSource messages;

    public MailResetLinkSender(BrandProperties properties,
                               ObjectProvider<JavaMailSender> mailSender,
                               MessageSource messages) {
        this.properties = properties;
        this.mailSender = mailSender;
        this.messages = messages;
    }

    @Override
    public void send(String email, String link, Locale locale) {
        if (!properties.mail().enabled()) {
            log.info("Password reset requested — mail is disabled, link: {}", link);
            return;
        }
        JavaMailSender sender = mailSender.getIfAvailable();
        if (sender == null) {
            log.warn("brand.mail.enabled is true but no JavaMailSender is configured "
                    + "(set SPRING_MAIL_HOST); logging the link instead");
            log.info("Password reset link: {}", link);
            return;
        }
        ResetMail text = compose(link, locale);
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(properties.mail().from());
        message.setTo(email);
        message.setSubject(text.subject());
        message.setText(text.body());
        sender.send(message);
        log.info("Password reset mail sent");
    }

    /** The seam the test reads: what would be sent, without an SMTP server. */
    ResetMail compose(String link, Locale locale) {
        Locale target = locale == null ? Locale.ENGLISH : locale;
        return new ResetMail(
                messages.getMessage("mail.reset.subject", null, target),
                messages.getMessage("mail.reset.body.intro", null, target) + "\n\n" + link + "\n");
    }
}
