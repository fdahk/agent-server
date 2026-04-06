/*
 * 全局异常处理器——统一捕获所有 Controller 抛出的异常并转换为标准 API 响应
 * 如果没有全局异常处理器，当 Controller 中抛出异常时：
 *   · Spring Boot 会返回默认的错误页面或 JSON（格式不可控）
 *   · 前端无法用统一的方式解析错误信息
 *   · 敏感的异常堆栈信息可能泄露给用户
 *
 * 本类拦截各类异常，统一转换为 ApiResponse 格式返回，确保：
 *   · 前端永远收到一致的 JSON 结构
 *   · 错误码（HTTP 状态码）准确反映错误类型
 *   · 不会泄露服务器内部实现细节
 */
package com.agentserver.server.common.exception;

import com.agentserver.server.common.api.ApiResponse;
import jakarta.validation.ConstraintViolationException;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

/**
 * 全局异常处理器。
 *
 * @RestControllerAdvice —— 这是 @ControllerAdvice + @ResponseBody 的组合注解。
 *   · @ControllerAdvice：告诉 Spring "这个类要拦截所有 Controller 的异常"，
 *     相当于给所有 Controller 加了一个统一的 try-catch。
 *   · @ResponseBody：返回值自动序列化为 JSON（和 @RestController 中的效果一样）。
 *
 *   有了它，不需要在每个 Controller 方法里都写 try-catch，
 *   异常会自动被这里的处理方法捕获。
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * 处理参数校验失败异常（@Valid 注解触发的校验）。
     *
     * 【触发场景】
     * 当 Controller 方法的参数上标了 @Valid，而请求体中的字段不满足校验规则
     * （如 @NotBlank、@Size、@Email 等）时，Spring 会抛出 MethodArgumentNotValidException。
     *
     * 【注解说明】
     * @ExceptionHandler(XxxException.class) —— 告诉 Spring：
     *   "当任何 Controller 抛出 XxxException 时，由这个方法来处理。"
     *   每种异常类型对应一个处理方法，Spring 会自动匹配最精确的处理器。
     *
     * 【返回值说明——ResponseEntity】
     * ResponseEntity 是 Spring 提供的 HTTP 响应包装类，可以同时设置：
     *   · HTTP 状态码（如 400 Bad Request）
     *   · 响应体（这里是 ApiResponse 对象，会被自动序列化为 JSON）
     *
     * @param exception 校验失败的异常对象，包含所有字段的错误信息
     * @return HTTP 400 响应，body 中包含拼接好的校验错误信息
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException exception) {
        String message = exception.getBindingResult()
            .getFieldErrors()
            .stream()
            .map(FieldError::getDefaultMessage)
            .collect(Collectors.joining("; "));
        return ResponseEntity.badRequest().body(ApiResponse.failure(message));
    }

    /**
     * 处理约束违反异常（方法参数上的 @NotNull、@Min 等直接标注触发的校验）。
     *
     * 【触发场景】
     * 与上面的 MethodArgumentNotValidException 不同，ConstraintViolationException
     * 通常在方法参数直接加了校验注解（如 @Min(1) int page）且参数不合法时触发。
     *
     * @param exception 约束违反异常
     * @return HTTP 400 响应，body 中包含违反约束的描述
     */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleConstraintViolation(ConstraintViolationException exception) {
        return ResponseEntity.badRequest().body(ApiResponse.failure(exception.getMessage()));
    }

    /**
     * 处理带 HTTP 状态码的业务异常。
     *
     * 【触发场景】
     * 当业务代码主动抛出 ResponseStatusException 时触发，例如：
     *   throw new ResponseStatusException(HttpStatus.NOT_FOUND, "用户不存在");
     * 这是一种优雅的方式来返回特定 HTTP 状态码 + 错误信息。
     *
     * @param exception 响应状态异常，包含 HTTP 状态码和错误原因
     * @return 对应 HTTP 状态码的响应
     */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiResponse<Void>> handleResponseStatus(ResponseStatusException exception) {
        HttpStatus status = HttpStatus.valueOf(exception.getStatusCode().value());
        return ResponseEntity.status(status).body(ApiResponse.failure(exception.getReason()));
    }

    /**
     * 兜底异常处理器——捕获所有未被上面方法匹配到的异常。
     *
     * 【触发场景】
     * 当出现意料之外的异常（如 NullPointerException、数据库连接失败等）时，
     * 如果没有更精确的处理器匹配，就会进入这个兜底方法。
     *
     * 返回 HTTP 500（服务器内部错误），并将异常消息返回给前端。
     *
     * @param exception 任意类型的异常
     * @return HTTP 500 响应
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGeneric(Exception exception) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(ApiResponse.failure(exception.getMessage() == null ? "服务内部错误" : exception.getMessage()));
    }
}
