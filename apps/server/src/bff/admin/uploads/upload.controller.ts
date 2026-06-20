/**
 * 上传 HTTP Controller
 *
 * 路由：
 * - POST   /upload/avatar: 上传头像（folder: avatars）
 * - POST   /upload/file: 上传通用文件（folder: files）
 * - GET    /upload: 分页查询（?includeDeleted=true 时含已软删）
 * - DELETE /upload/:id: 软删除
 * - DELETE /upload/:id/hard: 彻底删除（已软删才能删）
 * - POST   /upload/:id/restore: 恢复已软删的文件
 *
 * 上传约束：
 * - 头像：≤ 2MB，仅允许 image/jpeg | image/png | image/webp
 * - 通用文件：≤ 10MB，按 MIME 白名单
 *
 * 安全：
 * - MIME 白名单正则 + 文件内容 magic bytes 校验（双重防护，防 MIME 伪造）
 * - SVG 不在白名单中（含 XSS 风险，image/svg+xml 可嵌入 JavaScript）
 *
 * 权限：
 * - 需要登录 + config:file:create / config:file:list / config:file:delete
 * - config:file:hard_delete / config:file:restore
 */
import {
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Query,
    Req,
    UploadedFile,
    UseInterceptors,
    ParseFilePipe,
    MaxFileSizeValidator,
    FileTypeValidator,
    BadRequestException,
    type PipeTransform,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Permission } from '../../../common/decorators/permission.decorator.js';
import { RequireAuth } from '../../../common/decorators/require-auth.decorator.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { UuidSchema, QueryUploadSchema } from '@packages/shared';
import { UploadService, type QueryUploadInput } from '../../../modules/upload/upload.service.js';

/** 头像 MIME 白名单正则 */
const AVATAR_MIME_REGEX = /^image\/(jpeg|png|webp)$/;
/**
 * 通用文件 MIME 白名单正则
 * - 不含 image/svg+xml（SVG 可嵌入 JavaScript，存在存储型 XSS 风险）
 */
const FILE_MIME_REGEX =
    /^(image\/(jpeg|png|webp|gif)|application\/(pdf|zip|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)|text\/(plain|csv))$/;

/**
 * Magic bytes 映射表：MIME 类型 → 文件头签名
 * - 用于校验文件内容与声称的 MIME 类型是否一致
 * - 防御 MIME 类型伪造攻击
 *
 * 注意：text/plain 和 text/csv 无固定 magic bytes，
 * 但不能直接放行（攻击者可上传任意二进制并声称是 text），
 * 改用 checkTextBytes 做首字节可打印字符校验（见下方 checkMagicBytes）
 */
const MAGIC_BYTES: Record<string, number[][]> = {
    'image/jpeg': [[0xff, 0xd8, 0xff]],
    'image/png': [[0x89, 0x50, 0x4e, 0x47]],
    'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF
    'image/gif': [[0x47, 0x49, 0x46, 0x38]], // GIF8
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
    'application/zip': [[0x50, 0x4b, 0x03, 0x04]], // PK..
    'text/plain': [], // 纯文本无固定 magic bytes，走 checkTextBytes 校验
    'text/csv': [], // CSV 无固定 magic bytes，走 checkTextBytes 校验
};

/**
 * 需要做文本内容校验的 MIME 类型集合
 * - 这些类型无固定 magic bytes，但必须确保内容是合法文本（防二进制伪装）
 */
const TEXT_MIME_TYPES: ReadonlySet<string> = new Set(['text/plain', 'text/csv']);

/**
 * 检查 buffer 是否为合法文本内容
 * - 允许 UTF-8 BOM（0xEF 0xBB 0xBF）
 * - 允许常见换行符（0x0A LF / 0x0D CR）
 * - 允许水平制表符（0x09 TAB）
 * - 其余字节必须是可打印 ASCII（0x20-0x7E）或 UTF-8 多字节序列首字节（0xC2-0xF4）
 * - 拒绝空 buffer
 * - 拒绝含 NUL 字节（0x00）的内容（二进制文件特征）
 *
 * 校验范围：前 512 字节（足够判断文本/二进制，避免大文件全量扫描开销）
 *
 * @returns true 表示是合法文本内容
 */
function checkTextBytes(buffer: Buffer): boolean {
    /** 拒绝空文件 */
    if (buffer.length === 0) return false;

    /** 校验前 512 字节（性能与准确性的平衡点） */
    const checkLen = Math.min(buffer.length, 512);
    let i = 0;

    /** 跳过 UTF-8 BOM（0xEF 0xBB 0xBF） */
    if (checkLen >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        i = 3;
    }

    for (; i < checkLen; i++) {
        const byte = buffer[i];
        /** NUL 字节是二进制文件的强特征，直接拒绝 */
        if (byte === 0x00) return false;
        /** 允许：TAB(0x09) / LF(0x0A) / CR(0x0D) */
        if (byte === 0x09 || byte === 0x0a || byte === 0x0d) continue;
        /** 允许：可打印 ASCII（0x20-0x7E） */
        if (byte >= 0x20 && byte <= 0x7e) continue;
        /**
         * 允许：UTF-8 多字节序列首字节
         * - 0xC2-0xDF：2 字节序列首字节（如中文、拉丁扩展）
         * - 0xE0-0xEF：3 字节序列首字节（如 CJK）
         * - 0xF0-0xF4：4 字节序列首字节（如 emoji）
         * 跳过后续 continuation bytes（0x80-0xBF）由循环自然处理
         */
        if (byte >= 0xc2 && byte <= 0xf4) continue;
        /** 允许：UTF-8 continuation bytes（0x80-0xBF） */
        if (byte >= 0x80 && byte <= 0xbf) continue;
        /** 其他字节（控制字符、0x7F DEL 等）视为二进制特征，拒绝 */
        return false;
    }
    return true;
}

/**
 * 检查文件 buffer 的前 N 字节是否匹配任意一组签名
 * - 对于有固定 magic bytes 的类型：校验文件头签名
 * - 对于 text/* 类型：调用 checkTextBytes 做文本内容校验
 */
function checkMagicBytes(buffer: Buffer, signatures: number[][], mimeType: string): boolean {
    /** text 类型走文本内容校验（防二进制伪装成 text/plain） */
    if (TEXT_MIME_TYPES.has(mimeType)) {
        return checkTextBytes(buffer);
    }
    if (signatures.length === 0) return true; // 无签名要求，放行
    return signatures.some((sig) => {
        if (buffer.length < sig.length) return false;
        return sig.every((byte, i) => buffer[i] === byte);
    });
}

/**
 * 自定义 MagicBytesValidator
 * - 在 FileTypeValidator（基于 MIME 字符串）之后执行
 * - 读取文件 buffer 的前几个字节验证文件真实类型
 * - 参数类型使用 Multer File（运行时由 FileInterceptor 注入）
 */
class MagicBytesValidator implements PipeTransform {
    transform(value: { mimetype: string; buffer: Buffer; [key: string]: unknown }) {
        const mimeType = value.mimetype;
        const signatures = MAGIC_BYTES[mimeType];
        if (signatures === undefined) {
            throw new BadRequestException({ code: 12002, message: `不支持的文件类型: ${mimeType}` });
        }
        /** 校验 magic bytes 或文本内容（text 类型走 checkTextBytes） */
        if (!checkMagicBytes(value.buffer, signatures, mimeType)) {
            throw new BadRequestException({ code: 12003, message: '文件内容与声明的类型不匹配' });
        }
        return value;
    }
}

@Controller('upload')
@RequireAuth()
export class UploadController {
    constructor(private readonly uploadService: UploadService) {}

    /**
     * 上传头像
     * - 三重校验：文件大小（≤ 2MB）+ MIME 类型 + magic bytes
     */
    @Permission('config:file:create')
    @Post('avatar')
    @UseInterceptors(FileInterceptor('file'))
    async uploadAvatar(
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
                    new FileTypeValidator({ fileType: AVATAR_MIME_REGEX }),
                ],
            }),
            MagicBytesValidator,
        )
        file: { originalname: string; mimetype: string; buffer: Buffer; [key: string]: unknown },
        @Req() req: { user: { accountId: string } },
    ) {
        const result = await this.uploadService.upload({
            accountId: req.user.accountId,
            folder: 'avatars',
            originalName: file.originalname,
            mimeType: file.mimetype,
            buffer: file.buffer,
        });
        return { code: 0, message: 'ok', data: result };
    }

    /**
     * 上传通用文件
     * - 三重校验：文件大小（≤ 10MB）+ MIME 类型 + magic bytes
     */
    @Permission('config:file:create')
    @Post('file')
    @UseInterceptors(FileInterceptor('file'))
    async uploadFile(
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
                    new FileTypeValidator({ fileType: FILE_MIME_REGEX }),
                ],
            }),
            MagicBytesValidator,
        )
        file: { originalname: string; mimetype: string; buffer: Buffer; [key: string]: unknown },
        @Req() req: { user: { accountId: string } },
    ) {
        const result = await this.uploadService.upload({
            accountId: req.user.accountId,
            folder: 'files',
            originalName: file.originalname,
            mimeType: file.mimetype,
            buffer: file.buffer,
        });
        return { code: 0, message: 'ok', data: result };
    }

    /**
     * 分页查询
     */
    @Permission('config:file:view')
    @Get()
    async findAll(@Query(new ZodValidationPipe(QueryUploadSchema)) query: QueryUploadInput) {
        const result = await this.uploadService.findAll(query);
        return { code: 0, message: 'ok', data: result };
    }

    /**
     * 软删除
     */
    @Permission('config:file:delete')
    @Delete(':id')
    async delete(
        @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
        @Req() req: { user: { accountId: string } },
    ) {
        const result = await this.uploadService.delete(id, req.user.accountId);
        return { code: 0, message: 'ok', data: result };
    }

    /**
     * 彻底删除文件（物理删除已软删的文件行）
     * - 路径：upload/:id/hard
     * - 权限码：config:file:hard_delete
     */
    @Permission('config:file:hard_delete')
    @Delete(':id/hard')
    async hardDelete(
        @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
        @Req() req: { user: { accountId: string } },
    ) {
        const result = await this.uploadService.hardDelete(id, req.user.accountId);
        return { code: 0, message: 'ok', data: result };
    }

    /**
     * 恢复已软删除的文件（把 deletedAt 置为 NULL）
     * - 路径：upload/:id/restore
     * - 权限码：config:file:restore
     */
    @Permission('config:file:restore')
    @Post(':id/restore')
    async restore(
        @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
        @Req() req: { user: { accountId: string } },
    ) {
        const result = await this.uploadService.restore(id, req.user.accountId);
        return { code: 0, message: 'ok', data: result };
    }
}
