/*
 * 统一 API 响应包装器——让所有接口返回格式一致的 JSON 结构
 * 在前后端分离的项目中，前端希望每个接口的响应格式都是统一的，这样解析起来方便。
 * 本类定义了一个标准的响应结构：
 *   {
 *     "success": true/false,   ← 请求是否成功
 *     "data": { ... },         ← 成功时携带的业务数据
 *     "message": "ok"          ← 提示信息（成功为 "ok"，失败为错误原因）
 *   }
 *
 * 所有 Controller 都通过 ApiResponse.success() 或 ApiResponse.failure() 来构造响应，
 * 确保前端拿到的 JSON 结构永远是一致的。
 */
package com.agentserver.server.common.api;

/**
 * 统一 API 响应包装类。
 *
 * 【Java 语法说明——record】
 * record 是 Java 16+ 的语法糖，用于创建不可变的数据类。
 * 圆括号中的参数会自动变成 private final 字段，并自动生成同名 getter、构造函数、
 * equals()、hashCode()、toString() 方法。
 *
 * @param <T> 响应数据的类型
 */
public record ApiResponse<T>(
    boolean success,
    T data,
    String message
) {
    /**
     * 构造一个成功响应（携带数据，消息默认为 "ok"）。
     *
     * 【Java 语法说明——静态方法】
     * static 方法不属于某个具体实例，而是属于类本身，可以直接通过类名调用：
     *   ApiResponse.success(myData)
     * 这种模式叫做"静态工厂方法"，比直接 new 更具可读性。
     *
     * @param data 要返回给前端的业务数据
     * @param <T>  数据类型
     * @return 成功的 ApiResponse 实例
     */
    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(true, data, "ok");
    }

    /**
     * 构造一个成功响应（携带数据和自定义消息）。
     *
     * @param data    要返回给前端的业务数据
     * @param message 自定义的提示信息
     * @param <T>     数据类型
     * @return 成功的 ApiResponse 实例
     */
    public static <T> ApiResponse<T> success(T data, String message) {
        return new ApiResponse<>(true, data, message);
    }

    /**
     * 构造一个失败响应（data 为 null，只携带错误信息）。
     *
     * @param message 错误描述信息，会展示给前端
     * @param <T>     数据类型（虽然失败时 data 为 null，但泛型仍需声明以保持类型安全）
     * @return 失败的 ApiResponse 实例
     */
    public static <T> ApiResponse<T> failure(String message) {
        return new ApiResponse<>(false, null, message);
    }
}
