package app.brand.content;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Stores {@link AnonymityLevel} as the lowercase text every content table's CHECK
 * constraint allows ({@code anonymity_level}, {@code display_level}).
 */
@Converter(autoApply = true)
public class AnonymityLevelConverter implements AttributeConverter<AnonymityLevel, String> {

    @Override
    public String convertToDatabaseColumn(AnonymityLevel attribute) {
        return attribute == null ? null : attribute.value();
    }

    @Override
    public AnonymityLevel convertToEntityAttribute(String dbData) {
        return dbData == null ? null : AnonymityLevel.of(dbData);
    }
}
