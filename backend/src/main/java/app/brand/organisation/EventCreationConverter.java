package app.brand.organisation;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Stores {@link EventCreation} as the lowercase text the CHECK constraint allows. */
@Converter(autoApply = true)
public class EventCreationConverter implements AttributeConverter<EventCreation, String> {

    @Override
    public String convertToDatabaseColumn(EventCreation attribute) {
        return attribute == null ? null : attribute.value();
    }

    @Override
    public EventCreation convertToEntityAttribute(String dbData) {
        return dbData == null ? null : EventCreation.of(dbData);
    }
}
