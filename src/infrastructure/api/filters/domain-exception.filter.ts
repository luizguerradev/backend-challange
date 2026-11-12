import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import {
  ResourceNotFoundError,
  IdempotencyConflictError,
  DuplicateWalletConflictError,
  BusinessRuleRejectionError,
} from '../../../application/common/application.errors.js';
import { InsufficientFundsError } from '../../../domain/wallet/entity/wallet.entity.js';

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errorCode = 'INTERNAL_PROCESSING_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'object' && res !== null && 'message' in res ? (res as any).message : exception.message;
      errorCode = status === HttpStatus.BAD_REQUEST ? 'INVALID_PAYLOAD' : 'HTTP_EXCEPTION';
    } else if (exception instanceof ResourceNotFoundError) {
      status = HttpStatus.NOT_FOUND;
      errorCode = 'RESOURCE_NOT_FOUND';
      message = exception.message;
    } else if (exception instanceof IdempotencyConflictError) {
      status = HttpStatus.CONFLICT;
      errorCode = exception.code;
      message = exception.message;
    } else if (exception instanceof DuplicateWalletConflictError) {
      status = HttpStatus.CONFLICT;
      errorCode = exception.code;
      message = exception.message;
    } else if (exception instanceof BusinessRuleRejectionError) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      errorCode = exception.failureCode;
      message = exception.message;
    } else if (exception instanceof InsufficientFundsError) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      errorCode = 'INSUFFICIENT_FUNDS';
      message = exception.message;
    } else if (exception instanceof Error) {
      const pgCode = (exception as any).code;
      if (pgCode === '23505') {
        status = HttpStatus.CONFLICT;
        errorCode = 'UNIQUE_CONSTRAINT_VIOLATION';
        message = 'Duplicate resource or concurrent idempotency key conflict';
      } else if (exception.message.includes('requires referenceExternalTransactionId')) {
        status = HttpStatus.BAD_REQUEST;
        errorCode = 'INVALID_PAYLOAD';
        message = exception.message;
      } else {
        message = exception.message;
      }
    }

    response.status(status).json({
      statusCode: status,
      errorCode,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}