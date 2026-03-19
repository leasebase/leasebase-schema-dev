import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResponse, paginate } from '../common/dto/pagination.dto';

export interface WorkOrderRow {
  id: string;
  unit_id: string;
  status: string;
  priority: string;
  category: string;
  description: string;
  assignee_id: string | null;
  created_at: string;
}

@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService) {}

  async listWorkOrders(
    orgId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<WorkOrderRow>> {
    const where = { organizationId: orgId };

    const [rows, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.workOrder.count({ where }),
    ]);

    const data: WorkOrderRow[] = rows.map((r) => ({
      id: r.id,
      unit_id: r.unitId,
      status: r.status,
      priority: r.priority,
      category: r.category,
      description: r.description,
      assignee_id: r.assigneeId,
      created_at: r.createdAt.toISOString(),
    }));

    return paginate(data, total, page, limit);
  }
}
