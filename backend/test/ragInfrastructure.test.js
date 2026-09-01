const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  chunkText,
} = require('../src/services/chunkingService');

const {
  loadDocumentsFromDirectory,
} = require('../src/services/documentProcessingService');

test(
  'chunking keeps metadata offsets and applies overlap',
  () => {
    const source =
      'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen.';

    const chunks = chunkText(source, {
      chunkSize: 50,
      overlap: 10,
    });

    assert.ok(chunks.length > 1);

    assert.equal(
      chunks[0].chunkIndex,
      0
    );

    assert.ok(
      chunks[1].startOffset <
      chunks[0].endOffset
    );

    assert.equal(
      chunks
        .map((chunk) => chunk.content)
        .join(' ')
        .includes('One'),
      true
    );
  }
);

test(
  'JSON loader reads a temporary medical document without a project dataset',
  async () => {
    const directory = await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        'careguide-rag-'
      )
    );

    try {
      await fs.writeFile(
        path.join(
          directory,
          'temporary.json'
        ),
        JSON.stringify([
          {
            id: 'temporary-fever',
            condition: 'Fever',
            description:
              'A temporary test document for RAG infrastructure.',
          },
        ])
      );

      const documents =
        await loadDocumentsFromDirectory(
          directory
        );

      assert.equal(
        documents.length,
        1
      );

      assert.equal(
        documents[0].externalId,
        'temporary-fever'
      );

      assert.match(
        documents[0].content,
        /description/i
      );
    } finally {
      await fs.rm(
        directory,
        {
          recursive: true,
          force: true,
        }
      );
    }
  }
);

test(
  'age-aware dataset records become separate English, Hindi, and Kannada RAG documents',
  async () => {
    const {
      documentsFromRecord,
    } = require(
      '../src/services/documentProcessingService'
    );

    const documents =
      documentsFromRecord(
        {
          id: 42,
          category: 'Renal',

          disease_en:
            'Kidney stone',

          disease_hi:
            'गुर्दे की पथरी',

          disease_kn:
            'ಮೂತ್ರಪಿಂಡದ ಕಲ್ಲು',

          description_en:
            'English information',

          description_hi:
            'हिंदी जानकारी',

          description_kn:
            'ಕನ್ನಡ ಮಾಹಿತಿ',
        },
        'dataset.json',
        0
      );

    assert.deepEqual(
      documents.map(
        (document) =>
          document.language
      ),
      ['en', 'hi', 'kn']
    );

    assert.equal(
      documents[0].externalId,
      '42:en'
    );

    assert.match(
      documents[2].content,
      /ಕನ್ನಡ/
    );
  }
);

test(
  'medical conversational records retain their RAG policy metadata',
  () => {
    const { documentFromRecord } = require('../src/services/documentProcessingService');
    const document = documentFromRecord({
      conversation_id: 'policy-1', language: 'en', user_message: 'I have fever',
      normalized_intent: 'fever', patient_age_required: true,
      minimum_questions: 'age; onset_or_duration',
      relevance_action: 'ask_followups_before_disease_retrieval',
      candidate_disease_policy: 'do_not_list_possible_diseases_from_one_symptom',
    }, 'medical.json', 0);
    assert.equal(document.metadata.source_type, 'medical_dataset');
    assert.equal(document.metadata.normalized_intent, 'fever');
    assert.equal(document.metadata.patient_age_required, true);
    assert.equal(document.metadata.relevance_action, 'ask_followups_before_disease_retrieval');
  }
);

test(
  'exact ages map to the dataset age bands',
  () => {
    const { mapAgeToBand } = require('../src/services/medicalDatasetService');
    assert.equal(mapAgeToBand(8).id, 'child');
    assert.equal(mapAgeToBand(18).id, 'adult');
    assert.equal(mapAgeToBand(65).id, 'older_adult');
    assert.equal(mapAgeToBand(0, 0).id, 'newborn');
  }
);

test(
  'embedding service uses Ollama local /api/embed response',
  async () => {
    const originalFetch =
      global.fetch;

    global.fetch = async (
      url,
      options
    ) => {
      assert.match(
        String(url),
        /\/api\/embed$/
      );

      const request =
        JSON.parse(options.body);

      assert.equal(
        request.model,
        'nomic-embed-text:latest'
      );

      assert.equal(
        request.input,
        'What is fever?'
      );

      return {
        ok: true,

        json: async () => ({
          embeddings: [
            Array.from(
              { length: 768 },
              (_, index) => {
                if (index === 0) {
                  return 0.1;
                }

                if (index === 1) {
                  return 0.2;
                }

                if (index === 2) {
                  return 0.3;
                }

                return 0;
              }
            ),
          ],
        }),
      };
    };

    try {
      delete require.cache[
        require.resolve(
          '../src/services/embeddingService'
        )
      ];

      const {
        generateEmbedding,
      } = require(
        '../src/services/embeddingService'
      );

      const embedding =
        await generateEmbedding(
          'What is fever?'
        );

      assert.equal(
        embedding.length,
        768
      );

      assert.deepEqual(
        embedding.slice(0, 3),
        [0.1, 0.2, 0.3]
      );
    } finally {
      global.fetch =
        originalFetch;
    }
  }
);

test(
  'Ollama RAG generation includes retrieved context and language',
  async () => {
    const originalFetch =
      global.fetch;

    const oldUrl =
      process.env.OLLAMA_BASE_URL;

    const oldModel =
      process.env.OLLAMA_MODEL;

    process.env.OLLAMA_BASE_URL =
      'http://localhost:11434';

    process.env.OLLAMA_MODEL =
      'llama3.2:latest';

    global.fetch = async (
      url,
      options
    ) => {
      if (String(url).endsWith('/api/tags')) {
        return {
          ok: true,
          json: async () => ({
            models: [
              { name: 'llama3.2:latest' },
            ],
          }),
        };
      }

      const request =
        JSON.parse(options.body);

      const prompt =
        request.prompt;

      assert.match(
        prompt,
        /RETRIEVED MEDICAL CONTEXT/
      );

      assert.match(
        prompt,
        /Kannada/
      );

      return {
        ok: true,

        json: async () => ({
          response:
            'ಸ್ಥಳೀಯ ಉತ್ತರ',
        }),
      };
    };

    try {
      delete require.cache[
        require.resolve(
          '../src/services/ollamaService'
        )
      ];

      const {
        generateMedicalResponse,
      } = require(
        '../src/services/ollamaService'
      );

      const result =
        await generateMedicalResponse({
          question:
            'ಜ್ವರ ಎಂದರೇನು?',

          retrievedContext:
            '[1] Fever context',

          language: 'kn',
        });

      assert.equal(
        result,
        'ಸ್ಥಳೀಯ ಉತ್ತರ'
      );
    } finally {
      global.fetch =
        originalFetch;

      process.env.OLLAMA_BASE_URL =
        oldUrl;

      process.env.OLLAMA_MODEL =
        oldModel;
    }
  }
);

test(
  'hospital generation is grounded in the database context and uses the unavailable-data fallback rule',
  { skip: 'Directory responses now bypass Ollama and are covered by CareGuide routing tests.' },
  async () => {
    const originalFetch = global.fetch;
    const oldUrl = process.env.OLLAMA_BASE_URL;
    const oldModel = process.env.OLLAMA_MODEL;
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
    process.env.OLLAMA_MODEL = 'llama3.2:latest';
    global.fetch = async (url, options) => {
      if (String(url).endsWith('/api/tags')) {
        return { ok: true, json: async () => ({ models: [{ name: 'llama3.2:latest' }] }) };
      }
      const request = JSON.parse(options.body);
      assert.equal(request.model, 'llama3.2:latest');
      assert.match(request.prompt, /LIVE POSTGRESQL HOSPITAL RECORDS/);
      assert.match(request.prompt, /Never use pretrained knowledge for hospital facts/);
      assert.match(request.prompt, /I couldn't find this information in the hospital database\./);
      return { ok: true, json: async () => ({ response: "I couldn't find this information in the hospital database." }) };
    };
    try {
      delete require.cache[require.resolve('../src/services/ollamaService')];
      const { generateHospitalResponse } = require('../src/services/ollamaService');
      const result = await generateHospitalResponse({
        question: 'Which hospital has a helipad?',
        retrievedContext: 'LIVE POSTGRESQL HOSPITAL RECORDS (authoritative):\n[]',
      });
      assert.equal(result, "I couldn't find this information in the hospital database.");
    } finally {
      global.fetch = originalFetch;
      process.env.OLLAMA_BASE_URL = oldUrl;
      process.env.OLLAMA_MODEL = oldModel;
    }
  }
);

test(
  'PostgreSQL pgvector integration works',
  {
    skip:
      process.env.RAG_TEST_INTEGRATION !== '1',
  },
  async () => {
    const {
      pool,
      assertPgVector,
      upsertProcessedDocuments,
    } = require(
      '../src/services/ragVectorStore'
    );

    const {
      embeddingDimension,
    } = require(
      '../src/config/ragConfig'
    );

    const {
      retrieveRelevantChunks,
    } = require(
      '../src/services/ragRetrievalService'
    );

    const originalFetch =
      global.fetch;

    function createEmbedding(
      isFever = false
    ) {
      const vector =
        new Array(
          embeddingDimension
        ).fill(0);

      vector[0] = isFever ? 1 : 0;
      vector[1] = isFever ? 0 : 1;

      return vector;
    }

    global.fetch = async (
      _url,
      options
    ) => {
      const body =
        JSON.parse(options.body);

      const inputs =
        Array.isArray(body.input)
          ? body.input
          : [body.input];

      return {
        ok: true,

        json: async () => ({
          embeddings:
            inputs.map((input) =>
              createEmbedding(
                /fever/i.test(input)
              )
            ),
        }),
      };
    };

    try {
      console.log(
        '\n🔎 Checking pgvector...'
      );

      const pgVector =
        await assertPgVector();

      assert.equal(
        pgVector.installed,
        true
      );

      console.log(
        `✅ pgvector ${pgVector.version}`
      );

      assert.equal(
        embeddingDimension,
        768
      );

      console.log(
        '✅ Embedding dimension: 768'
      );

      /*
       * Insert test document.
       */
      await upsertProcessedDocuments([
        {
          externalId:
            'test-fever',

          title:
            'Temporary fever document',

          source:
            'rag-test',

          language:
            'en',

          metadata: {},

          content:
            'Fever can mean a raised body temperature.',

          chunks: [
            {
              chunkIndex: 0,

              startOffset: 0,

              endOffset:
                'Fever can mean a raised body temperature.'
                  .length,

              content:
                'Fever can mean a raised body temperature.',

              embedding:
                createEmbedding(true),
            },
          ],
        },
      ]);

      console.log(
        '✅ Test document inserted'
      );

      /*
       * Query PostgreSQL using RAG retrieval.
       */
      const chunks =
        await retrieveRelevantChunks(
          'What is fever?',
          {
            topK: 1,
            similarityThreshold: 0.5,
          }
        );

      assert.ok(
        chunks.length > 0,
        'No RAG chunks were retrieved.'
      );

      assert.equal(
        chunks[0].title,
        'Temporary fever document'
      );

      assert.match(
        chunks[0].content,
        /Fever/i
      );

      console.log(
        '✅ Vector retrieval successful'
      );
    } finally {
      global.fetch =
        originalFetch;

      /*
       * Clean only this test's data.
       */
      try {
        await pool.query(
          `
          DELETE FROM rag_documents
          WHERE source = $1
            AND external_id = $2
          `,
          [
            'rag-test',
            'test-fever',
          ]
        );

        console.log(
          '🧹 Test data cleaned up'
        );
      } catch (cleanupError) {
        console.error(
          '⚠️ Test cleanup failed:',
          cleanupError.message
        );
      }

      /*
       * DO NOT call pool.end().
       *
       * database.js owns this shared pool.
       */
    }
  }
);
