import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResponse, paginate } from '../common/dto/pagination.dto';

export interface DocumentRow {
  id: string;
  related_type: string;
  related_id: string;
  name: string;
  mime_type: string;
  created_at: string;
  /** False when the backing S3 object doesn't exist (e.g. demo data). */
  download_available: boolean;
}

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listDocuments(
    orgId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<DocumentRow>> {
    const where = { organizationId: orgId };

    const [rows, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.document.count({ where }),
    ]);

    const data: DocumentRow[] = rows.map((r) => ({
      id: r.id,
      related_type: r.relatedType,
      related_id: r.relatedId,
      name: r.name,
      mime_type: r.mimeType,
      created_at: r.createdAt.toISOString(),
      // S3 keys containing "demo-owner-org" are fake seed data with no real object.
      download_available: !r.s3Key.includes('demo-owner-org'),
    }));

    return paginate(data, total, page, limit);
  }
}
