import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResponse, paginate } from '../common/dto/pagination.dto';

export interface PropertyRow {
  id: string;
  name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
}

export interface UnitRow {
  id: string;
  property_id: string;
  unit_number: string;
  status: string;
  rent_amount: number;
  bedrooms: number;
  bathrooms: number;
  square_feet: number | null;
}

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async listProperties(
    orgId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<PropertyRow>> {
    const [rows, total] = await Promise.all([
      this.prisma.property.findMany({
        where: { organizationId: orgId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.property.count({ where: { organizationId: orgId } }),
    ]);

    const data: PropertyRow[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      address_line1: r.addressLine1,
      address_line2: r.addressLine2,
      city: r.city,
      state: r.state,
      postal_code: r.postalCode,
    }));

    return paginate(data, total, page, limit);
  }

  async listUnitsForProperty(
    orgId: string,
    propertyId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<UnitRow>> {
    // Verify property belongs to org
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, organizationId: orgId },
    });
    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const where = { organizationId: orgId, propertyId };

    const [rows, total] = await Promise.all([
      this.prisma.unit.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { unitNumber: 'asc' },
      }),
      this.prisma.unit.count({ where }),
    ]);

    const data: UnitRow[] = rows.map((r) => ({
      id: r.id,
      property_id: r.propertyId,
      unit_number: r.unitNumber,
      status: r.status,
      rent_amount: r.rentAmount,
      bedrooms: r.bedrooms,
      bathrooms: r.bathrooms,
      square_feet: r.squareFeet,
    }));

    return paginate(data, total, page, limit);
  }
}
