import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResponse, paginate } from '../common/dto/pagination.dto';

export interface PaymentRow {
  id: string;
  lease_id: string;
  amount: number;
  status: string;
  method: string | null;
  created_at: string;
}

export interface LedgerRow {
  id: string;
  lease_id: string;
  type: string;
  amount: number;
  status: string;
  due_date: string;
  description: string | null;
}

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPayments(
    orgId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<PaymentRow>> {
    const where = { organizationId: orgId };

    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.count({ where }),
    ]);

    const data: PaymentRow[] = rows.map((r) => ({
      id: r.id,
      lease_id: r.leaseId,
      amount: r.amount,
      status: r.status,
      method: r.method,
      created_at: r.createdAt.toISOString(),
    }));

    return paginate(data, total, page, limit);
  }

  async listLedger(
    orgId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<LedgerRow>> {
    const where = { organizationId: orgId };

    const [rows, total] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { dueDate: 'desc' },
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);

    const data: LedgerRow[] = rows.map((r) => ({
      id: r.id,
      lease_id: r.leaseId,
      type: r.type,
      amount: r.amount,
      status: r.status,
      due_date: r.dueDate.toISOString(),
      description: r.description,
    }));

    return paginate(data, total, page, limit);
  }
}
