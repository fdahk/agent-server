/**
 * HTTP 文本响应数据对象——封装一次 HTTP 请求的响应结果
 * 当 JavaHttpClient 向外部服务发起 HTTP 请求后，会收到响应。
 * 本类将响应中最常用的信息（响应体、状态码、响应头、请求 URL）封装成一个
 * 不可变的数据对象，供调用方方便地读取和判断。
 *
 * 调用方可以通过 ok() 方法快速判断请求是否成功（2xx 状态码）。
 */
package com.agentserver.server.shared.http;

import java.net.http.HttpHeaders;

/**
 * HTTP 文本响应数据类。
 */
public record HttpTextResponse(
    /** HTTP 响应体的文本内容（通常是 JSON 字符串） */
    String body,

    /** HTTP 状态码，如 200（成功）、400（请求错误）、500（服务器错误） */
    int status,

    /**
     * HTTP 响应头集合。
     * HttpHeaders 是 Java 内置 HTTP 客户端提供的不可变响应头对象，
     * 可以通过 headers.firstValue("Content-Type") 等方法读取特定头的值。
     */
    HttpHeaders headers,

    /** 发起请求时的 URL，保留在响应中方便调试和日志记录 */
    String url
) {
    /**
     * 判断本次 HTTP 请求是否成功。
     *
     * HTTP 协议约定：状态码在 200~299 范围内表示"成功"。
     * 常见的成功状态码：
     *   · 200 OK —— 请求成功
     *   · 201 Created —— 资源创建成功
     *   · 204 No Content —— 成功但无响应体
     *
     * @return true 表示请求成功（2xx），false 表示失败
     */
    public boolean ok() {
        return status >= 200 && status < 300;
    }
}
