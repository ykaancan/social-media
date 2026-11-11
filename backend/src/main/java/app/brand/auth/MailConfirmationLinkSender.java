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
 * [D18] Sends the email-confirmation link exactly the way
 * {@link MailResetLinkSender} sends the reset link: by SMTP when
 * {@code brand.mail.enabled} is true, otherwise written to the log at INFO.
 *
 * <p>The logged link carries a live token, so this is a development and
 * pre-launch affordance only. No log line here names the recipient (KVKK, as in
 * {@link MailResetLinkSender}).
 *
 * <p>Subject and body are i18n ({@code mail.confirm.*}), in the language of the
 * request that caused the link.
 */
@Component
public class MailConfirmationLinkSender implements ConfirmationLinkSender {

    private static final Logger log = LoggerFactory.getLogger(MailConfirmationLinkSender.class);

    /** Subject and body, in the language of the request that asked for the link. */
    record ConfirmationMail(String subject, String body) {
    }

    private final BrandProperties properties;
    private final ObjectProvider<JavaMailSender> mailSender;
    private final MessageSource messages;

    public MailConfirmationLinkSender(BrandProperties properties,
                                      ObjectProvider<JavaMailSender> mailSender,
                                      MessageSource messages) {
        this.properties = properties;
        this.mailSender = mailSender;
        this.messages = messages;
    }

    @Override
    public void send(String email, String link, Locale locale) {
        if (!properties.mail().enabled()) {
            log.info("Email confirmation requested — mail is disabled, link: {}", link);
            return;
        }
        JavaMailSender sender = mailSender.getIfAvailable();
        if (sender == null) {
            log.warn("brand.mail.enabled is true but no JavaMailSender is configured "
                    + "(set SPRING_MAIL_HOST); logging the link instead");
            log.info("Email confirmation link: {}", link);
            return;
        }
        ConfirmationMail text = compose(link, locale);
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(properties.mail().from());
        message.setTo(email);
        message.setSubject(text.subject());
        message.setText(text.body());
        sender.send(message);
        log.info("Email confirmation mail sent");
    }

    /** The seam the test reads: what would be sent, without an SMTP server. */
    ConfirmationMail compose(String link, Locale locale) {
        Locale target = locale == null ? Locale.ENGLISH : locale;
        return new ConfirmationMail(
                messages.getMessage("mail.confirm.subject", null, target),
                messages.getMessage("mail.confirm.body.intro", null, target) + "\n\n" + link + "\n");
    }
}
