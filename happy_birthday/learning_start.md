# React 学习笔记 —— 从零开始

---

## DOM 是什么？

**DOM = Document Object Model（文档对象模型）**

简单记：浏览器把你的网页（Document）变成一个可以用代码操作的树形结构（Object Model）。

```mermaid
flowchart TD
    A["你写的 HTML 代码<br><h1>你好</h1><br><button>点我</button>"]
    --> B["浏览器解析"]
    --> C["DOM<br>（浏览器内部的页面结构树）<br>可以理解为浏览器把网页变成了一棵树"]
    --> D["你看到的网页画面"]
```

---

## 第一步：理解网页的本质

每一个网页，背后都是 HTML 代码。浏览器读取这段代码，把它变成你看到的画面。

---

## 第二步：没有 React 时的痛点

```mermaid
flowchart TD
    用户点击按钮 --> 你写JS代码
    你写JS代码 --> 手动找到DOM里的元素
    手动找到DOM里的元素 --> 手动修改它
    手动修改它 --> 页面更新

    style 你写JS代码 fill:#ffcccc
    style 手动找到DOM里的元素 fill:#ffcccc
    style 手动修改它 fill:#ffcccc
```

当页面越来越复杂，你要手动追踪几十上百个地方的变化，**非常容易出错且难以维护**。

---

## 第三步：React 的核心思想

React 说：**你只管描述"数据变了之后页面长什么样"，DOM 的事我来帮你做。**

```mermaid
flowchart LR
    subgraph 你负责
        A["定义数据<br>state = {count: 0}"]
        B["描述页面长什么样<br><div>当前数字: 0</div>"]
    end

    subgraph React负责
        C["监听数据变化"]
        D["自动更新页面"]
    end

    A --> B --> C --> D
```

---

## 第四步：React 完整工作流程

```mermaid
flowchart TD
    A["你写 JSX 代码<br>看起来像 HTML 但其实是 JS"]
    --> B["React 在内存里建一棵<br>'虚拟页面树'<br>（Virtual DOM）<br>相当于页面的草稿"]

    B --> C{"数据（state）<br>有没有变化？"}

    C -- 没变化 --> D["不做任何事"]

    C -- 变化了 --> E["React 生成新的<br>'虚拟页面树'草稿"]

    E --> F["对比新旧草稿<br>找出哪里不同"]

    F --> G["只把不同的地方<br>更新到真实页面"]
    F --> H["没变化的部分<br>完全不动"]

    G --> I["用户看到更新后的页面"]

    style B fill:#ddf,stroke:#88f
    style E fill:#ddf,stroke:#88f
    style F fill:#ffd,stroke:#fa0
    style G fill:#dfd,stroke:#0a0
    style H fill:#eee,stroke:#aaa
```

---

## 第五步：用「计数器」具体举例

```mermaid
sequenceDiagram
    participant 用户
    participant 按钮
    participant React数据(state)
    participant 虚拟草稿
    participant 真实页面

    用户->>按钮: 点击 "+1"
    按钮->>React数据(state): count: 0 → count: 1
    React数据(state)->>虚拟草稿: 重新生成草稿（显示数字1）
    虚拟草稿->>虚拟草稿: 对比旧草稿（数字0）找不同
    虚拟草稿->>真实页面: 只更新数字那一块
    真实页面->>用户: 看到数字变成 1
```

---

## 一句话总结

```mermaid
flowchart LR
    数据变了 --> React自动重新画页面

    style React自动重新画页面 fill:#dfd,stroke:#0a0
```

**你只需要关心数据，页面的更新 React 全包了。**

---

## 怎么把 React 引入到项目中

### 第一步：安装 Node.js

去 [nodejs.org](https://nodejs.org) 下载安装。

### 第二步：用命令创建项目

```mermaid
flowchart TD
    A["安装 Node.js<br>nodejs.org 下载安装"]
    --> B["打开终端，运行以下命令之一<br><br>推荐（Next.js框架）：<br>npx create-next-app@latest 你的项目名<br><br>纯React：<br>npx create-react-app 你的项目名"]
    --> C["进入项目文件夹<br>cd 你的项目名"]
    --> D["启动开发服务器<br>npm run dev"]
    --> E["浏览器打开<br>http://localhost:3000<br>看到初始页面说明启动成功"]
    --> F["打开 VS Code<br>在编辑器里修改代码<br>浏览器会自动刷新显示最新效果"]

    style F fill:#dfd,stroke:#0a0
    style B fill:#ffd,stroke:#fa0
```

### 在哪里写代码？

```mermaid
flowchart LR
    A["VS Code 编辑器<br>（你写代码的地方）"]
    --> B["保存文件"]
    --> C["浏览器自动刷新<br>（你看结果的地方）"]

    style A fill:#ddf,stroke:#88f
    style C fill:#dfd,stroke:#0a0
```

> 你**不是**在浏览器里写代码，浏览器只是显示结果。
> 代码写在编辑器（如 VS Code）里，保存后浏览器自动更新。

---

## 本项目文件结构说明

```
happy_birthday/
├── learning_start.md      ← 你现在看的这个文件（React学习笔记）
├── package.json           ← 项目依赖配置（告诉npm需要装哪些库）
├── vite.config.js         ← 项目构建工具配置
├── index.html             ← HTML入口（浏览器读取的起点）
└── src/
    ├── main.jsx           ← React程序入口（把React挂载到页面上）
    ├── App.jsx            ← 根组件（最外层的组件）
    ├── HappyBirthday.jsx  ← 生日庆祝页面组件（主要逻辑在这里）
    └── HappyBirthday.css  ← 样式文件（页面的外观）
```
