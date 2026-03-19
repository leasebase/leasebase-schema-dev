import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResponse, paginate } from '../common/dto/pagination.dto';

export interface LeaseRow {
  id: string;
  unit_id: string;
  status: string;
  rent_amount: number;
  start_date: string;
  end_date: string;
}

@Injectable()
export class LeasesService {
  constructor(private readonly prisma: PrismaService) {}

  async listLeases(
    orgId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<LeaseRow>> {
    const where = { organizationId: orgId };

    const [rows, total] = await Promise.all([
      this.prisma.lease.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.lease.count({ where }),
    ]);

    const data: LeaseRow[] = rows.map((r) => ({
      id: r.id,
      unit_id: r.unitId,
      status: r.status,
      rent_amount: r.rentAmount,
      start_date: r.startDate.toISOString(),
      end_date: r.endDate.toISOString(),
    }));

    return paginate(data, total, page, limit);
  }
}
