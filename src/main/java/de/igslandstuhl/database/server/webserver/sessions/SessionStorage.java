package de.igslandstuhl.database.server.webserver.sessions;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import de.igslandstuhl.database.server.Server;
import de.igslandstuhl.database.server.webserver.requests.HttpRequest;

public class SessionStorage<T> {
    private final Map<Session, T> intern = new HashMap<>();

    public synchronized T get(Session session) {
        return intern.get(session);
    }
    public synchronized T get(HttpRequest request) {
        return intern.get(Server.getInstance().getWebServer().getSessionManager().getSession(request));
    }
    public synchronized void set(Session session, T object) {
        intern.put(session, object);
    }
    public synchronized void set(HttpRequest request, T object) {
        intern.put(Server.getInstance().getWebServer().getSessionManager().getSession(request), object);
    }
    public synchronized void remove(Session session) {
        intern.remove(session);
    }
    public synchronized void remove(Session session, T value) {
        intern.remove(session,value);
    }
    public synchronized void remove(T value) {
        intern.keySet().stream().filter((key) -> Objects.equals(intern.get(key), value))
        .toList().forEach((k) -> remove(k));
    }
    public synchronized List<Session> getSessions(T value) {
        return intern.entrySet().stream()
            .filter(entry -> Objects.equals(entry.getValue(), value))
            .map(Map.Entry::getKey)
            .toList();
    }
    public synchronized boolean contains(T value) {
        return intern.values().contains(value);
    }
    public synchronized void clear() {
        intern.clear();
    }
}
