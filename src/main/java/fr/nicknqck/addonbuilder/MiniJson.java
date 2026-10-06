package fr.nicknqck.addonbuilder;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Lecteur JSON minimal (objets, tableaux, chaînes, nombres, booléens, null), sans aucune dépendance. */
final class MiniJson {

    private final String text;
    private int pos;

    private MiniJson(String text) {
        this.text = text;
    }

    static Object parse(String text) {
        MiniJson p = new MiniJson(text);
        Object value = p.value();
        p.skip();
        if (p.pos != text.length()) throw p.error("contenu inattendu");
        return value;
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> object(Object o) {
        if (o instanceof Map) return (Map<String, Object>) o;
        throw new IllegalArgumentException("objet JSON attendu");
    }

    @SuppressWarnings("unchecked")
    static List<Object> array(Object o) {
        if (o == null) return new ArrayList<>();
        if (o instanceof List) return (List<Object>) o;
        throw new IllegalArgumentException("tableau JSON attendu");
    }

    static String string(Object o) {
        if (o instanceof String) return (String) o;
        throw new IllegalArgumentException("texte JSON attendu");
    }

    private Object value() {
        skip();
        char c = peek();
        if (c == '{') return readObject();
        if (c == '[') return readArray();
        if (c == '"') return readString();
        if (text.startsWith("true", pos)) { pos += 4; return Boolean.TRUE; }
        if (text.startsWith("false", pos)) { pos += 5; return Boolean.FALSE; }
        if (text.startsWith("null", pos)) { pos += 4; return null; }
        return readNumber();
    }

    private Map<String, Object> readObject() {
        Map<String, Object> map = new LinkedHashMap<>();
        pos++;
        skip();
        if (peek() == '}') { pos++; return map; }
        while (true) {
            skip();
            String key = readString();
            skip();
            expect(':');
            map.put(key, value());
            skip();
            char c = next();
            if (c == '}') return map;
            if (c != ',') throw error("',' ou '}' attendu");
        }
    }

    private List<Object> readArray() {
        List<Object> list = new ArrayList<>();
        pos++;
        skip();
        if (peek() == ']') { pos++; return list; }
        while (true) {
            list.add(value());
            skip();
            char c = next();
            if (c == ']') return list;
            if (c != ',') throw error("',' ou ']' attendu");
        }
    }

    private String readString() {
        expect('"');
        StringBuilder sb = new StringBuilder();
        while (true) {
            char c = next();
            if (c == '"') return sb.toString();
            if (c != '\\') { sb.append(c); continue; }
            char e = next();
            switch (e) {
                case 'n': sb.append('\n'); break;
                case 't': sb.append('\t'); break;
                case 'r': sb.append('\r'); break;
                case 'b': sb.append('\b'); break;
                case 'f': sb.append('\f'); break;
                case '"': case '\\': case '/': sb.append(e); break;
                case 'u':
                    sb.append((char) Integer.parseInt(text.substring(pos, pos + 4), 16));
                    pos += 4;
                    break;
                default: throw error("échappement invalide");
            }
        }
    }

    private Object readNumber() {
        int start = pos;
        while (pos < text.length() && "+-0123456789.eE".indexOf(text.charAt(pos)) >= 0) pos++;
        if (start == pos) throw error("valeur inattendue");
        return Double.valueOf(text.substring(start, pos));
    }

    private void skip() {
        while (pos < text.length() && Character.isWhitespace(text.charAt(pos))) pos++;
    }

    private char peek() {
        if (pos >= text.length()) throw error("fin inattendue");
        return text.charAt(pos);
    }

    private char next() {
        char c = peek();
        pos++;
        return c;
    }

    private void expect(char c) {
        if (next() != c) throw error("'" + c + "' attendu");
    }

    private IllegalArgumentException error(String msg) {
        return new IllegalArgumentException("JSON invalide à la position " + pos + " : " + msg);
    }
}
