import { createZodDto } from 'nestjs-zod';
import { SaveAccountMenusSchema } from '@starter/contracts';

/** 保存账户特例授权入参（BFF REST 端点 PUT /admin/accounts/:id/menus） */
export class SaveAccountMenusDto extends createZodDto(SaveAccountMenusSchema) {}
