import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/interfaces/current-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Roles(UserRole.ORG_ADMIN, UserRole.PM_STAFF, UserRole.OWNER, UserRole.TENANT)
  @ApiOperation({ summary: 'List payments for the current organization' })
  list(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() q: PaginationQueryDto,
  ) {
    return this.paymentsService.listPayments(user.orgId, q.page, q.limit);
  }

  @Get('ledger')
  @Roles(UserRole.ORG_ADMIN, UserRole.PM_STAFF, UserRole.OWNER, UserRole.TENANT)
  @ApiOperation({ summary: 'List ledger entries for the current organization' })
  listLedger(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() q: PaginationQueryDto,
  ) {
    return this.paymentsService.listLedger(user.orgId, q.page, q.limit);
  }
}
