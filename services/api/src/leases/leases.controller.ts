import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/interfaces/current-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { LeasesService } from './leases.service';

@ApiTags('leases')
@ApiBearerAuth()
@Controller('leases')
export class LeasesController {
  constructor(private readonly leasesService: LeasesService) {}

  @Get()
  @Roles(UserRole.ORG_ADMIN, UserRole.PM_STAFF, UserRole.OWNER, UserRole.TENANT)
  @ApiOperation({ summary: 'List leases for the current organization' })
  list(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() q: PaginationQueryDto,
  ) {
    return this.leasesService.listLeases(user.orgId, q.page, q.limit);
  }
}
