import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';

// Postgres SQLSTATEs surfaced by raw queries (Prisma P2010) and their safe client-facing mapping.
const PG_STATE: Record<string, [HttpStatus, string]> = {
  '23505': [HttpStatus.CONFLICT, 'A record with the same unique value already exists'],
  '23503': [HttpStatus.CONFLICT, 'The operation references a record that does not exist or is still in use'],
  '23502': [HttpStatus.BAD_REQUEST, 'A required value is missing'],
  '22001': [HttpStatus.BAD_REQUEST, 'A value is too long'],
  '22P02': [HttpStatus.BAD_REQUEST, 'A value has an invalid format'],
  '22003': [HttpStatus.BAD_REQUEST, 'A numeric value is out of range'],
};

const PRISMA_CODE: Record<string, [HttpStatus, string]> = {
  P2002: [HttpStatus.CONFLICT, 'A record with the same unique value already exists'],
  P2003: [HttpStatus.CONFLICT, 'The operation references a record that does not exist or is still in use'],
  P2025: [HttpStatus.NOT_FOUND, 'Record not found'],
  P2000: [HttpStatus.BAD_REQUEST, 'A value is too long'],
  P2011: [HttpStatus.BAD_REQUEST, 'A required value is missing'],
  P2006: [HttpStatus.BAD_REQUEST, 'A value has an invalid format'],
  P2023: [HttpStatus.BAD_REQUEST, 'A value has an invalid format'],
};

/**
 * Response shape: { success: false, message, errors, meta }. HttpExceptions keep their own status
 * and message. Anything else never reaches the client verbatim — known database constraint errors
 * become a safe 4xx message, everything unexpected becomes a generic 500 with an errorId; the full
 * error (Prisma invocation, SQL state, stack) is only written to the server log under that id.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('[NexusCore] ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: any = null;
    let errorId: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object') {
        message = (body as any).message || message;
        errors = (body as any).errors || null;
      }
    } else {
      const mapped = this.mapDatabaseError(exception);
      errorId = randomUUID();
      if (mapped) [status, message] = mapped;
      const err = exception as Error;
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(exception);
      this.logger.error(`[${errorId}] ${request.method} ${request.url} -> ${status}: ${detail}`, err?.stack);
    }

    if (response.headersSent) return;
    response.status(status).json({
      success: false,
      message,
      errors,
      meta: {
        path: request.url,
        method: request.method,
        timestamp: new Date().toISOString(),
        ...(errorId ? { errorId } : {}),
      },
    });
  }

  private mapDatabaseError(e: unknown): [HttpStatus, string] | null {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2010') {
        const state = (e.meta as any)?.code as string | undefined;
        return (state && PG_STATE[state]) || null;
      }
      return PRISMA_CODE[e.code] ?? null;
    }
    if (e instanceof Prisma.PrismaClientValidationError) return [HttpStatus.BAD_REQUEST, 'Invalid request data'];
    return null;
  }
}
