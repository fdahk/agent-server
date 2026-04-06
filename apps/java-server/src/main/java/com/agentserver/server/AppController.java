/**
 *
 * AppController.java
 * 应用根路由控制器——提供一个最简单的"健康探针"接口
 * 当你在浏览器或 Postman 中访问 GET /api 时，就会命中这个控制器，
 * 它返回 "Hello World!" 字符串，用来快速确认服务是否正常启动。
 * 用作"服务是否存活"的判断依据。
 */
package com.agentserver.server;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 应用根路由控制器。
 *
 * @RestController —— 这是 @Controller + @ResponseBody 的组合注解。
 *   · @Controller：告诉 Spring "我是一个处理 HTTP 请求的控制器"
 *   · @ResponseBody：告诉 Spring "我的方法返回值直接作为 HTTP 响应体返回（比如 JSON 字符串），
 *                    而不是去查找一个 HTML 模板页面"
 *   合在一起，@RestController 就是"专门写 REST API 的控制器"。
 *
 * @RequestMapping("/api") —— 给这个控制器设置一个"基础路径"。
 *   该类中所有方法的路由都会以 /api 作为前缀。
 */
@RestController
@RequestMapping("/api")
public class AppController {

    /**
     * 处理 GET /api 请求，返回一个简单的问候字符串。
     *
     * @GetMapping —— 等价于 @RequestMapping(method = RequestMethod.GET)。
     *   因为没有传路径参数，所以它直接匹配控制器的基础路径 /api。
     *
     * @return 纯文本字符串 "Hello World!"，Spring 会自动把它放进 HTTP 响应体中
     */
    @GetMapping
    public String hello() {
        return "Hello World!";
    }
}
