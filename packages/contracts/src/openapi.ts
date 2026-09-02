export const openApiDocument = {
  openapi: '3.1.0',
  info: { title: 'Motionly Cloud API', version: '1.0.0' },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: { sessionCookie: { type: 'apiKey', in: 'cookie', name: 'motionly_session' } },
    schemas: {
      ApiError: {
        type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message', 'requestId'], properties: {
          code: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string' }, details: { type: 'object', additionalProperties: true },
        } } },
      },
      GenerationError: {
        type: 'object', required: ['code', 'message'], properties: {
          code: { type: 'string' }, message: { type: 'string' }, details: { type: 'object', additionalProperties: true },
        },
      },
      Generation: {
        type: 'object',
        required: ['id', 'workspaceId', 'projectId', 'threadId', 'intent', 'status', 'stage', 'progress', 'baseSourceHash', 'baseRevision', 'outputSourceHash', 'provider', 'model', 'attempt', 'maxAttempts', 'createdAt', 'startedAt', 'finishedAt', 'error'],
        properties: {
          id: { type: 'string', format: 'uuid' }, workspaceId: { type: 'string', format: 'uuid' }, projectId: { type: 'string', format: 'uuid' },
          threadId: { type: 'string', format: 'uuid' }, intent: { enum: ['CREATE', 'EDIT'] },
          status: { enum: ['QUEUED', 'PREPARING', 'GENERATING', 'VALIDATING', 'RENDERING', 'REVIEWING', 'REPAIRING', 'PUBLISHING', 'CANCELLING', 'COMPLETED', 'AWAITING_APPLY', 'CANCELLED', 'FAILED'] },
          stage: { type: 'string' }, progress: { type: 'integer', minimum: 0, maximum: 100 },
          baseSourceHash: { type: 'string', pattern: '^[a-f0-9]{64}$' }, baseRevision: { type: 'integer' }, outputSourceHash: { type: ['string', 'null'], pattern: '^[a-f0-9]{64}$' },
          provider: { enum: ['gemini', 'openai', 'anthropic', 'openai-compatible'] }, model: { type: 'string' }, attempt: { type: 'integer' }, maxAttempts: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' }, startedAt: { type: ['string', 'null'], format: 'date-time' }, finishedAt: { type: ['string', 'null'], format: 'date-time' },
          error: { oneOf: [{ type: 'null' }, { $ref: '#/components/schemas/GenerationError' }] },
        },
      },
      Project: {
        type: 'object',
        required: ['id', 'workspaceId', 'name', 'slug', 'width', 'height', 'fps', 'duration', 'sourceHash', 'revision', 'createdBy', 'createdAt', 'updatedAt', 'savedAt', 'archivedAt'],
        properties: {
          id: { type: 'string', format: 'uuid' }, workspaceId: { type: 'string', format: 'uuid' }, name: { type: 'string' }, slug: { type: 'string' },
          width: { type: 'integer' }, height: { type: 'integer' }, fps: { type: 'integer' }, duration: { type: 'number' },
          sourceHash: { type: 'string', pattern: '^[a-f0-9]{64}$' }, revision: { type: 'integer', minimum: 1 }, createdBy: { type: 'string', format: 'uuid' },
          createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' }, savedAt: { type: 'string', format: 'date-time' }, archivedAt: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      ProjectSource: {
        type: 'object',
        required: ['sourceHash', 'savedAt', 'revision', 'files'],
        properties: {
          sourceHash: { type: 'string', pattern: '^[a-f0-9]{64}$' }, savedAt: { type: 'string', format: 'date-time' }, revision: { type: 'integer', minimum: 1 },
          files: { type: 'object', additionalProperties: false, required: ['composition.html', 'styles.css', 'timeline.js', 'index.ts'], properties: {
            'composition.html': { type: 'string' }, 'styles.css': { type: 'string' }, 'timeline.js': { type: 'string' }, 'index.ts': { type: 'string' },
          } },
        },
      },
      Asset: {
        type: 'object',
        required: ['id', 'workspaceId', 'state', 'fileName', 'contentType', 'byteSize', 'checksum', 'createdAt', 'downloadUrl'],
        properties: {
          id: { type: 'string', format: 'uuid' }, workspaceId: { type: 'string', format: 'uuid' }, state: { enum: ['PENDING', 'READY', 'FAILED', 'DELETED'] },
          fileName: { type: 'string' }, contentType: { type: 'string' }, byteSize: { type: 'integer' }, checksum: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' }, downloadUrl: { type: ['string', 'null'] },
        },
      },
    },
  },
  security: [{ sessionCookie: [] }],
  paths: {
    '/health': { get: { security: [], responses: { 200: { description: 'Healthy' } } } },
    '/ready': { get: { security: [], responses: { 200: { description: 'Ready; PostgreSQL dependency check passed' }, 503: { description: 'Not ready' } } } },
    '/v1/workspaces/{workspaceId}/generations': {
      post: { summary: 'Generate a new Motionly project', parameters: idempotencyParameters('workspaceId'), requestBody: jsonBody(createGenerationSchema()), responses: { 202: generationResponse(), 429: errorResponse() } },
    },
    '/v1/projects/{projectId}/generations': {
      get: { summary: 'List project generations', parameters: [pathId('projectId'), page(), pageSize()], responses: { 200: generationListResponse() } },
      post: { summary: 'Edit a Motionly project with AI', parameters: idempotencyParameters('projectId'), requestBody: jsonBody(editGenerationSchema()), responses: { 202: generationResponse(), 409: errorResponse(), 429: errorResponse() } },
    },
    '/v1/projects/{projectId}': {
      get: { summary: 'Get project metadata for generation reconciliation', parameters: [pathId('projectId')], responses: { 200: wrappedResponse('#/components/schemas/Project') } },
    },
    '/v1/projects/{projectId}/source': {
      get: { summary: 'Get the current authored Motionly source bundle', parameters: [pathId('projectId')], responses: { 200: wrappedResponse('#/components/schemas/ProjectSource') } },
    },
    '/v1/generations/{generationId}': {
      get: { summary: 'Get generation status', parameters: [pathId('generationId')], responses: { 200: generationResponse() } },
    },
    '/v1/generations/{generationId}/events': {
      get: { summary: 'Replay and stream generation events', parameters: [pathId('generationId'), { name: 'Last-Event-ID', in: 'header', schema: { type: 'integer', minimum: 0 } }], responses: { 200: { description: 'text/event-stream', content: { 'text/event-stream': {} } } } },
    },
    '/v1/generations/{generationId}/cancel': actionPath('Cancel a generation', 202),
    '/v1/generations/{generationId}/retry': actionPath('Retry a generation', 202, jsonBody({
      type: 'object', additionalProperties: false, properties: {
        baseSourceHash: { type: 'string', pattern: '^[a-f0-9]{64}$' }, baseRevision: { type: 'integer', minimum: 1 },
      },
      description: 'Omit both base fields to retry from the latest project revision; otherwise provide both.',
    })),
    '/v1/generations/{generationId}/apply': {
      post: {
        summary: 'Apply a conflicting candidate', parameters: idempotencyParameters('generationId'),
        requestBody: jsonBody({ type: 'object', additionalProperties: false, required: ['revision'], properties: { revision: { type: 'integer', minimum: 1 } } }),
        responses: { 201: applyResponse(), 409: errorResponse(), 429: errorResponse() },
      },
    },
    '/v1/generations/{generationId}/artifacts': {
      get: { summary: 'List generation artifacts', parameters: [pathId('generationId')], responses: { 200: { description: 'Artifact list' } } },
    },
    '/v1/artifacts/{artifactId}/download': {
      get: { summary: 'Download a private generation artifact', parameters: [pathId('artifactId')], responses: { 200: { description: 'Artifact binary' } } },
    },
    '/v1/workspaces/{workspaceId}/assets/uploads': {
      post: {
        summary: 'Create an asset upload', parameters: [pathId('workspaceId'), csrfHeader()],
        requestBody: jsonBody({ type: 'object', additionalProperties: false, required: ['fileName', 'contentType', 'byteSize', 'checksum'], properties: {
          fileName: { type: 'string', maxLength: 255 }, contentType: { type: 'string' }, byteSize: { type: 'integer', minimum: 1, maximum: 100_000_000 }, checksum: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' },
        } }),
        responses: { 201: uploadSessionResponse() },
      },
    },
    '/v1/assets/uploads/{uploadId}/content': {
      put: {
        summary: 'Upload asset bytes', parameters: [pathId('uploadId'), csrfHeader()],
        requestBody: { required: true, description: 'Use the exact content type declared when creating the upload.', content: { '*/*': { schema: { type: 'string', format: 'binary' } } } },
        responses: { 200: { description: 'Uploaded' } },
      },
    },
    '/v1/workspaces/{workspaceId}/assets/uploads/{uploadId}/complete': {
      post: { summary: 'Verify and complete an asset upload', parameters: [pathId('workspaceId'), pathId('uploadId'), csrfHeader()], responses: { 200: wrappedResponse('#/components/schemas/Asset') } },
    },
    '/v1/projects/{projectId}/assets': {
      post: {
        summary: 'Attach a ready asset to a project', parameters: [pathId('projectId'), csrfHeader()],
        requestBody: jsonBody({ type: 'object', additionalProperties: false, required: ['assetId'], properties: { assetId: { type: 'string', format: 'uuid' } } }),
        responses: { 204: { description: 'Attached' } },
      },
    },
    '/v1/assets/{assetId}': {
      get: { summary: 'Get authorized asset metadata', parameters: [pathId('assetId')], responses: { 200: wrappedResponse('#/components/schemas/Asset') } },
    },
    '/v1/assets/{assetId}/download': {
      get: { summary: 'Download authorized asset bytes', parameters: [pathId('assetId')], responses: { 200: { description: 'Asset binary', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } } } },
    },
  },
} as const;

function pathId(name: string) {
  return { name, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } as const;
}
function page() { return { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } } as const; }
function pageSize() { return { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } } as const; }
function csrfHeader() { return { name: 'X-CSRF-Token', in: 'header', required: true, schema: { type: 'string' } } as const; }
function idempotencyParameters(id: string) {
  return [
    pathId(id),
    csrfHeader(),
    { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', maxLength: 200 } },
  ] as const;
}
function wrappedResponse(reference: string) {
  return { description: 'Resource', content: { 'application/json': { schema: { type: 'object', required: ['data'], properties: { data: { $ref: reference } } } } } } as const;
}
function generationResponse() { return { description: 'Generation resource', content: { 'application/json': { schema: { type: 'object', required: ['data'], properties: { data: { $ref: '#/components/schemas/Generation' } } } } } } as const; }
function uploadSessionResponse() {
  return {
    description: 'Upload session',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'object',
              required: ['uploadId', 'assetId', 'uploadUrl', 'expiresAt'],
              properties: {
                uploadId: { type: 'string', format: 'uuid' },
                assetId: { type: 'string', format: 'uuid' },
                uploadUrl: { type: 'string' },
                expiresAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
  } as const;
}
function generationListResponse() {
  return { description: 'Paginated generations', content: { 'application/json': { schema: { type: 'object', required: ['data', 'pagination'], properties: {
    data: { type: 'array', items: { $ref: '#/components/schemas/Generation' } },
    pagination: { type: 'object', required: ['page', 'pageSize', 'totalItems', 'totalPages'], properties: {
      page: { type: 'integer' }, pageSize: { type: 'integer' }, totalItems: { type: 'integer' }, totalPages: { type: 'integer' },
    } },
  } } } } } as const;
}
function errorResponse() { return { description: 'Stable API error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } } as const; }
function applyResponse() {
  return {
    description: 'Applied project revision',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'object',
              required: ['outputSourceHash'],
              properties: {
                outputSourceHash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
                projectRevision: { type: 'integer', minimum: 1 },
              },
            },
          },
        },
      },
    },
  } as const;
}
function actionPath(summary: string, successStatus: 201 | 202, requestBody?: ReturnType<typeof jsonBody>) {
  return { post: { summary, parameters: idempotencyParameters('generationId'), ...(requestBody ? { requestBody } : {}), responses: { [successStatus]: generationResponse(), 409: errorResponse(), 429: errorResponse() } } } as const;
}

function jsonBody(schema: Record<string, unknown>) {
  return { required: true, content: { 'application/json': { schema } } } as const;
}

function createGenerationSchema() {
  return {
    type: 'object', additionalProperties: false, required: ['prompt', 'project'], properties: {
      prompt: { type: 'string', minLength: 1, maxLength: 20_000 },
      project: { type: 'object', additionalProperties: false, required: ['name', 'width', 'height', 'fps', 'duration'], properties: {
        name: { type: 'string' }, width: { type: 'integer', minimum: 1, maximum: 7_680 }, height: { type: 'integer', minimum: 1, maximum: 7_680 }, fps: { type: 'integer', minimum: 1, maximum: 240 }, duration: { type: 'number', exclusiveMinimum: 0, maximum: 86_400 },
      } },
      presetId: { type: 'string', default: 'motionly-product-promo' }, assetIds: { type: 'array', maxItems: 50, items: { type: 'string', format: 'uuid' } },
    },
  } as const;
}

function editGenerationSchema() {
  return {
    type: 'object', additionalProperties: false, required: ['prompt', 'baseSourceHash', 'baseRevision'], properties: {
      prompt: { type: 'string', minLength: 1, maxLength: 20_000 }, baseSourceHash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      baseRevision: { type: 'integer', minimum: 1 }, threadId: { type: 'string', format: 'uuid' },
      assetIds: { type: 'array', maxItems: 50, items: { type: 'string', format: 'uuid' } },
    },
  } as const;
}
