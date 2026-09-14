package app.brand.message;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Stores {@link MessageState} as the lowercase text {@code inbox_message.state}'s CHECK allows. */
@Converter(autoApply = true)
public class MessageStateConverter implements AttributeConverter<MessageState, String> {

    @Override
    public String convertToDatabaseColumn(MessageState attribute) {
        return attribute == null ? null : attribute.value();
    }

    @Override
    public MessageState convertToEntityAttribute(String dbData) {
        return dbData == null ? null : MessageState.of(dbData);
    }
}
