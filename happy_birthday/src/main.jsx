import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// 这里是 React 的启动点
// 找到 index.html 里的 <div id="root">，把整个 App 渲染进去
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
