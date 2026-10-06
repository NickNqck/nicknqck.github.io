package fr.nicknqck.addonbuilder;

import fr.nicknqck.interfaces.ICommandType;

/**
 * Type d'une commande de l'addon (équivalent d'une constante de CommandPower.CommandType : DS, AOT, NS...).
 * L'alias est le nom de la commande (ex. "zelda" pour /zelda). CommandPower.call compare les alias pour savoir si un
 * pouvoir appartient à la commande tapée : un futur pouvoir « commande » de l'addon utilisera donc
 * {@code new AddonCommandType("zelda")} comme ICommandType.
 */
public final class AddonCommandType implements ICommandType {

    private final String alias;

    public AddonCommandType(String alias) {
        this.alias = alias;
    }

    @Override
    public String getAlias() {
        return this.alias;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof ICommandType && this.alias.equals(((ICommandType) other).getAlias());
    }

    @Override
    public int hashCode() {
        return this.alias.hashCode();
    }

    @Override
    public String toString() {
        return this.alias;
    }
}
