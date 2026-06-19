<template>
    <div v-if="loading" class="py-4">
        <div class="flex items-center gap-3 mb-6">
            <n-skeleton :width="24" :height="24" round />
            <n-skeleton :width="200" :height="28" />
        </div>
        <n-divider />
        <n-skeleton :rows="3" class="mb-4" />
        <n-skeleton :rows="2" class="mb-4" :width="'80%'" />
        <n-skeleton :rows="4" class="mb-4" />
        <n-skeleton :rows="3" :width="'60%'" />
    </div>

    <div v-else-if="errorType === 'not-found'" class="py-16 flex flex-col items-center gap-4">
        <n-empty description="文档不存在">
            <template #extra>
                <n-button type="primary" @click="goHome">返回首页</n-button>
            </template>
        </n-empty>
    </div>

    <div v-else-if="errorType === 'network'" class="py-16 flex flex-col items-center gap-4">
        <n-empty description="网络异常，请检查连接后重试">
            <template #extra>
                <n-button type="primary" @click="retry">重试</n-button>
            </template>
        </n-empty>
    </div>

    <div v-else-if="error" class="py-16 flex flex-col items-center gap-4">
        <n-empty :description="error">
            <template #extra>
                <n-button type="primary" @click="retry">重试</n-button>
            </template>
        </n-empty>
    </div>

    <div v-else-if="!slug" class="py-16 flex flex-col items-center gap-4">
        <n-empty description="请从左侧导航选择文档" />
    </div>

    <div v-else class="flex gap-6">
        <div class="flex-1 min-w-0">
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="markdown-body" @click="onMarkdownClick" v-html="renderedHtml" />
        </div>

        <nav
            v-if="anchorLinks.length > 0"
            class="hidden lg:block !sticky top-4 self-start shrink-0"
            style="width: 220px; max-height: calc(100dvh - 100px); overflow-y: auto"
        >
            <div class="text-xs font-semibold text-gray-400 mb-2 pl-3">目录</div>
            <div class="border-l-2 border-gray-200 dark:border-gray-700">
                <div
                    v-for="link in anchorLinks"
                    :key="link.href"
                    :ref="
                        (el: unknown) => {
                            if (el) tocItemRefs[link.href] = el as HTMLElement;
                        }
                    "
                    class="cursor-pointer truncate text-xs leading-6 border-l-2 -ml-0.5 transition-colors"
                    :class="[
                        activeHref === link.href
                            ? 'border-[rgb(24,160,88)] text-[rgb(24,160,88)] font-medium'
                            : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-300',
                        link.level === 1 ? 'pl-3' : '',
                        link.level === 2 ? 'pl-5' : '',
                        link.level === 3 ? 'pl-7' : '',
                        link.level === 4 ? 'pl-9' : '',
                    ]"
                    :title="link.title"
                    @click="scrollToHeading(link.href)"
                >
                    {{ link.title }}
                </div>
            </div>
        </nav>
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'DocPage' });
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getDocContent, getDocsList } from '@/api/bff/docs';
import type { DocMeta } from '@/api/bff/docs';
import { ApiError } from '@/shared/request/request';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import DOMPurify from 'dompurify';

const markedInstance = new Marked({ gfm: true, breaks: true });
markedInstance.use(
    markedHighlight({
        langPrefix: 'hljs language-',
        highlight(code: string, lang: string) {
            if (lang && hljs.getLanguage(lang)) {
                return hljs.highlight(code, { language: lang }).value;
            }
            return hljs.highlightAuto(code).value;
        },
    }),
);

// ============================================================
// 标题 ID 注入 + 提取
// ============================================================
function injectHeadingIds(html: string): string {
    return html.replace(/<h([1-4])([^>]*)>(.*?)<\/h\1>/gi, (_m: string, level: string, attrs: string, text: string) => {
        if (/\bid\s*=/.test(attrs)) return _m;
        const plain = text.replace(/<[^>]*>/g, '').trim();
        const id = plain
            .toLowerCase()
            .replace(/[^\w一-鿿\s-]/g, '')
            .replace(/\s+/g, '-');
        if (!id) return _m;
        return `<h${level} id="${id}"${attrs}>${text}</h${level}>`;
    });
}

interface AnchorLink {
    title: string;
    href: string;
    level: number;
}

function extractHeadingsFromHtml(html: string): AnchorLink[] {
    const re = /<h([1-4])\s[^>]*\bid="([^"]*)"[^>]*>(.*?)<\/h[1-4]>/gi;
    const result: AnchorLink[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        result.push({
            level: parseInt(m[1], 10),
            href: `#${m[2]}`,
            title: m[3].replace(/<[^>]*>/g, '').trim(),
        });
    }
    return result;
}

// ============================================================
// DOMPurify
// ============================================================
const ALLOWED_TAGS = [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'br',
    'hr',
    'ul',
    'ol',
    'li',
    'a',
    'strong',
    'em',
    'del',
    's',
    'code',
    'pre',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'blockquote',
    'img',
    'input',
    'span',
    'div',
];
const ALLOWED_ATTR = [
    'href',
    'target',
    'rel',
    'title',
    'src',
    'alt',
    'width',
    'height',
    'id',
    'class',
    'type',
    'checked',
    'disabled',
];
function sanitize(html: string): string {
    return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}

// ============================================================
// 状态 + 加载
// ============================================================
const route = useRoute();
const router = useRouter();

const loading = ref(true);
const error = ref<string | null>(null);
const errorType = ref<'not-found' | 'network' | 'unknown'>('unknown');
const renderedHtml = ref('');
const docsList = ref<DocMeta[]>([]);
const anchorLinks = ref<AnchorLink[]>([]);
const activeHref = ref<string | null>(null);
const slug = computed(() => route.params.slug as string | undefined);

// ============================================================
// TOC scroll-spy — 缓存 DOM 引用，避免 getElementById + 批量读 rect
// ============================================================
const tocItemRefs: Record<string, HTMLElement> = {};
let headingElsCache: HTMLElement[] = [];
let rafId: number | null = null;
let scrollPending = false;

function buildHeadingCache() {
    headingElsCache = anchorLinks.value
        .map((l) => document.getElementById(l.href.slice(1)))
        .filter(Boolean) as HTMLElement[];
}

function updateActiveHeading() {
    const container = document.getElementById('doc-scroll-container');
    if (!container || headingElsCache.length === 0) return;

    // 一次性读完所有位置，避免逐个 getBoundingClientRect 造成的 layout thrashing
    const cTop = container.getBoundingClientRect().top;
    const positions: number[] = [];
    for (const el of headingElsCache) {
        positions.push(el.getBoundingClientRect().top - cTop);
    }

    // 找最后一个 top <= 60 的heading
    let activeId: string | null = null;
    for (let i = 0; i < positions.length; i++) {
        if (positions[i] <= 60) {
            activeId = `#${headingElsCache[i].id}`;
        } else {
            break;
        }
    }

    activeHref.value = activeId ?? `#${headingElsCache[0].id}`;
}

function onTocScroll() {
    if (scrollPending) return;
    scrollPending = true;
    rafId = requestAnimationFrame(() => {
        rafId = null;
        scrollPending = false;
        updateActiveHeading();
    });
}

onMounted(() => {
    nextTick(() => {
        buildHeadingCache();
        const container = document.getElementById('doc-scroll-container');
        if (container) {
            container.addEventListener('scroll', onTocScroll, { passive: true });
            updateActiveHeading();
        }
    });
});

onUnmounted(() => {
    const container = document.getElementById('doc-scroll-container');
    if (container) container.removeEventListener('scroll', onTocScroll);
    if (rafId !== null) cancelAnimationFrame(rafId);
    headingElsCache = [];
});

function scrollToHeading(href: string) {
    const el = document.getElementById(href.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 拦截 markdown 内部链接的点击事件（事件委托到 .markdown-body 容器）
// - 站内 .md 相对路径（如 ./05-扩展指南.md、./05-扩展指南.md#升级基座）→ 转 hash 路由
// - 同页 #anchor 锚点 → scrollToHeading
// - 外链（http://, https://, mailto: 等）放行
function onMarkdownClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    const anchor = target?.closest('a') as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href) return;

    // 外链放行（带协议、mailto、tel）
    if (/^(https?:|mailto:|tel:)/i.test(href)) return;

    // 同页纯锚点：#升级基座
    if (href.startsWith('#')) {
        e.preventDefault();
        const id = decodeURIComponent(href.slice(1));
        scrollToHeading('#' + id);
        return;
    }

    // 站内 .md 相对路径：./05-扩展指南.md 或 ./05-扩展指南.md#升级基座
    // 提取 slug（去 ./ 前缀、.md 后缀、?query；URL decode；安全校验）
    if (/\.md($|\?|#)/i.test(href)) {
        e.preventDefault();
        const [pathPart, hashPart] = href.split('#');
        // pathPart 形如 "./05-扩展指南.md" 或 "05-扩展指南.md?raw"
        const cleanPath = pathPart.split('?')[0].replace(/^\.\//, '').replace(/\.md$/i, '');
        let slug = cleanPath;
        try {
            slug = decodeURIComponent(cleanPath);
        } catch {
            /* keep raw */
        }
        // 防止路径穿越（与后端 isValidSlug 保持一致）
        if (!slug || slug.includes('..') || slug.includes('/') || slug.includes('\\')) return;
        const hash = hashPart ? decodeURIComponent(hashPart) : '';
        router.push({ name: 'DocPage', params: { slug }, hash: hash ? '#' + hash : undefined });
    }
}

async function loadDoc() {
    const s = slug.value;
    if (!s) {
        loading.value = false;
        return;
    }
    loading.value = true;
    error.value = null;
    anchorLinks.value = [];
    try {
        const doc = await getDocContent(s);
        const parsed = await markedInstance.parse(doc.content);
        const clean = sanitize(parsed);
        const withIds = injectHeadingIds(clean);
        renderedHtml.value = withIds;
        anchorLinks.value = extractHeadingsFromHtml(withIds);
        // 必须先把 loading 设为 false，否则 v-if="loading" 仍为 true，
        // 下一个 nextTick 之后 v-else 才会把 v-html 渲染到 DOM，
        // 导致 buildHeadingCache 时 document.getElementById 拿不到 heading。
        // 同一批状态变更在一次 patch 中渲染，nextTick 之后 heading 已在 DOM。
        loading.value = false;
        await nextTick();
        buildHeadingCache();
        updateActiveHeading();
    } catch (e: unknown) {
        if (e instanceof ApiError && e.status === 404) {
            error.value = '文档不存在';
            errorType.value = 'not-found';
        } else if (e instanceof ApiError && (e.status === 0 || e.status === 408)) {
            error.value = '网络异常，请检查连接后重试';
            errorType.value = 'network';
        } else {
            error.value = e instanceof Error ? e.message : '文档加载失败';
            errorType.value = 'unknown';
        }
        loading.value = false;
    }
}

async function fetchDocList() {
    try {
        docsList.value = await getDocsList();
    } catch {
        /* noop */
    }
}

function retry() {
    loadDoc();
}
function goHome() {
    const first = docsList.value[0]?.slug;
    router.push(first ? { name: 'DocPage', params: { slug: first } } : { name: 'DocPage' });
}

watch(slug, () => {
    if (slug.value) loadDoc();
});
fetchDocList();
if (slug.value) loadDoc();
else loading.value = false;
</script>
