package de.igslandstuhl.database.server.webserver.requests;

import de.igslandstuhl.database.server.webserver.Cookie;

public class HttpHeader {
    /**
     * Represents the path of the POST request.
     * This is the part of the request line that specifies the resource being requested.
     */
    private final String path;
    /**
     * Represents the content length of the POST request.
     * This is used to determine the size of the request body.
     */
    private final int contentLength;
    /**
     * Represents the cookies associated with the POST request.
     * This is an array of Cookie objects that may be included in the request.
     */
    private final Cookie[] cookies;
    private final String userAgent;
    private final String acceptLanguage;
    private final String contentType;

    /**
     * Constructs a new PostRequest with the given header and body.
     * @param header the header of the POST request
     */
    public HttpHeader(String header) {
        // Example: "POST /login HTTP/1.1"
        String[] parts = header.split(" ");
        this.path = parts[1];
        
        int contentLength = 0;
        Cookie[] cookies = new Cookie[0];
        String userAgent = null;
        String acceptLanguage = null;
        String contentType = null;
        for (String rawLine : header.split("\n")) {
            String line = rawLine.trim();
            if (line.regionMatches(true, 0, "Content-Length:", 0, 15)) {
                contentLength = Integer.parseInt(line.split(":")[1].trim());
            } else if (line.regionMatches(true, 0, "Content-Type:", 0, 13)) {
                contentType = line.substring(line.indexOf(':') + 1).trim();
            } else if (line.regionMatches(true, 0, "Cookie:", 0, 7)) {
                cookies = Cookie.parse(line.substring(7));
            } else if (line.regionMatches(true, 0, "User-Agent:", 0, 11)) {
                userAgent = line.split(":")[1].trim();
            } else if (line.regionMatches(true, 0, "Accept-Language:", 0, 16)) {
                acceptLanguage = line.split(":")[1].trim();
            }
        }
        this.cookies = cookies;
        this.contentLength = contentLength;
        this.userAgent = userAgent;
        this.acceptLanguage = acceptLanguage;
        this.contentType = contentType;
    }

    /**
     * Returns the path of the POST request.
     * This is the part of the request line that specifies the resource being requested.
     * @return the path of the POST request
     */
    public String getPath() {
        return path;
    }
    /**
     * Returns the content length of the POST request.
     * This is used to determine the size of the request body.
     * @return the content length of the POST request
     */
    public int getContentLength() {
        return contentLength;
    }

    public Cookie[] getCookies() {
        return cookies;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public String getAcceptLanguage() {
        return acceptLanguage;
    }

    public String getContentType() {
        return contentType;
    }
}
