import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/interfaces/current-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { MaintenanceService } from './maintenance.service';

@ApiTags('maintenance')
@ApiBearerAuth()
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get()
  @Roles(UserRole.ORG_ADMIN, UserRole.PM_STAFF, UserRole.OWNER, UserRole.TENANT)
  @ApiOperation({ summary: 'List work orders for the current organization' })
  list(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() q: PaginationQueryDto,
  ) {
    return this.maintenanceService.listWorkOrders(user.orgId, q.page, q.limit);
  }
}
