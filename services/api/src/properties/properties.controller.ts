import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/interfaces/current-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { PropertiesService } from './properties.service';

@ApiTags('properties')
@ApiBearerAuth()
@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get()
  @Roles(UserRole.ORG_ADMIN, UserRole.PM_STAFF, UserRole.OWNER, UserRole.TENANT)
  @ApiOperation({ summary: 'List properties for the current organization' })
  list(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() q: PaginationQueryDto,
  ) {
    return this.propertiesService.listProperties(user.orgId, q.page, q.limit);
  }

  @Get(':id/units')
  @Roles(UserRole.ORG_ADMIN, UserRole.PM_STAFF, UserRole.OWNER, UserRole.TENANT)
  @ApiOperation({ summary: 'List units for a property' })
  listUnits(
    @CurrentUserDecorator() user: CurrentUser,
    @Param('id') propertyId: string,
    @Query() q: PaginationQueryDto,
  ) {
    return this.propertiesService.listUnitsForProperty(user.orgId, propertyId, q.page, q.limit);
  }
}
