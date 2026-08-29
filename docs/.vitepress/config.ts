import { defineConfig } from 'vitepress'
// import './theme' — 禁用：Node 22 ESM 与 vitepress 1.6 不兼容，自定义主题为空（仅 extends DefaultTheme）不影响显示

const GH_URL = 'https://github.com/fishpond-studio/dmhub'
const VERSION = '0.1.0'

export default defineConfig({
  title: 'DMHub',
  description: '面向小型团队的开源域名协作管理工具，支持多数据库、DNS 解析同步、域名到期提醒',
  lang: 'zh-CN',

  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/favicon.png' }],
    ['meta', { name: 'description', content: 'DMHub - 域名协作管理工具，解决域名分散、到期无人管理、解析变更无通知等问题' }],
    ['meta', { property: 'og:title', content: 'DMHub - 域名协作管理工具' }],
    ['meta', { property: 'og:description', content: '面向小型团队的开源域名协作管理平台' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'DMHub - 域名协作管理工具' }],
    ['meta', { name: 'twitter:description', content: '面向小型团队的开源域名协作管理平台' }],
    ['link', { rel: 'stylesheet', href: '/custom.css' }],
  ],

  markdown: {
    lineNumbers: true,
    container: {
      tipLabel: '提示',
      warningLabel: '注意',
      dangerLabel: '危险',
      infoLabel: '说明',
      detailsLabel: '详情',
    },
  },

  themeConfig: {
    logo: '/logo.png',

    nav: [
      {
        text: '指南',
        link: '/guide/',
        activeMatch: '/guide/',
      },
      {
        text: 'API',
        link: '/api/',
        activeMatch: '/api/',
      },
      {
        text: '架构',
        link: '/reference/architecture',
        activeMatch: '/reference/',
      },
      {
        text: '参与',
        items: [
          { text: '贡献指南', link: '/reference/contributing' },
          { text: '更新日志', link: '/reference/changelog' },
        ],
      },
      {
        text: `v${VERSION}`,
        items: [
          { text: '更新日志', link: '/reference/changelog' },
          { text: 'GitHub', link: GH_URL },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '入门',
          items: [
            { text: '简介', link: '/guide/' },
            { text: '快速开始', link: '/guide/quick-start' },
            { text: '初始化引导', link: '/guide/setup' },
          ],
        },
        {
          text: '部署',
          items: [
            { text: 'Docker Compose', link: '/guide/docker' },
            { text: '本地开发', link: '/guide/local-dev' },
            { text: '环境变量', link: '/guide/env' },
          ],
        },
        {
          text: '核心功能',
          items: [
            { text: '仪表盘', link: '/guide/dashboard' },
            { text: '域名管理', link: '/guide/domains' },
            { text: 'DNS 解析记录', link: '/guide/dns-records' },
            { text: 'DNS 记录模板', link: '/guide/dns-templates' },
            { text: 'DNS 服务商', link: '/guide/dns-providers' },
            { text: '域名到期与 WHOIS', link: '/guide/domain-expiry' },
            { text: '域名指派与协作', link: '/guide/assignments' },
            { text: '快照与回滚', link: '/guide/snapshots' },
            { text: '批量导入', link: '/guide/import' },
          ],
        },
        {
          text: '团队与安全',
          items: [
            { text: '团队管理', link: '/guide/team' },
            { text: '通知配置', link: '/guide/notifications' },
            { text: '双因素认证', link: '/guide/2fa' },
            { text: 'OAuth 登录', link: '/guide/oauth' },
            { text: 'API Key', link: '/guide/api-keys' },
          ],
        },
        {
          text: '高级',
          items: [
            { text: '监控集成', link: '/guide/monitoring' },
            { text: '常见问题', link: '/guide/faq' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API 参考',
          items: [
            { text: '概述', link: '/api/' },
            { text: '认证', link: '/api/auth' },
            { text: '域名', link: '/api/domains' },
            { text: '解析记录', link: '/api/records' },
            { text: '快照', link: '/api/snapshots' },
            { text: '导出', link: '/api/export' },
          ],
        },
      ],
      '/reference/': [
        {
          text: '架构参考',
          items: [
            { text: '系统架构', link: '/reference/architecture' },
            { text: '数据库设计', link: '/reference/database' },
            { text: '权限模型', link: '/reference/permissions' },
          ],
        },
        {
          text: '参与',
          items: [
            { text: '贡献指南', link: '/reference/contributing' },
            { text: '更新日志', link: '/reference/changelog' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: GH_URL },
    ],

    footer: {
      message: 'AGPL-3.0 协议',
      copyright: 'Copyright © 2024-present DMHub',
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索' },
          modal: {
            noResultsText: '没有找到结果',
            resetButtonTitle: '重置搜索',
            footer: { selectText: '选择', navigateText: '导航' },
          },
        },
      },
    },

    outline: {
      level: [2, 3],
      label: '页面导航',
    },

    docFooter: {
      prev: '上一篇',
      next: '下一篇',
    },

    lastUpdated: {
      text: '最后更新于',
    },

    editLink: {
      pattern: `${GH_URL}/edit/main/docs/:path`,
      text: '在 GitHub 上编辑此页',
    },
  },
})
