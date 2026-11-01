.PHONY: setup ingest test eval validate-ground-truth validate-sources refresh-history export-review run up down smoke compose-up

setup:
	uv sync --frozen --extra dev

ingest:
	uv run python -m ingestion.flow

test: setup
	uv run pytest -q

eval:
	uv run python -m evaluation.eval_retrieval
	uv run python -m evaluation.eval_generation
	uv run python -m evaluation.eval_tools
	uv run python -m evaluation.eval_abstention
	uv run python -m evaluation.eval_ingestion
	uv run python -m evaluation.eval_rewrite
	uv run python -m evaluation.eval_chunking
	uv run python -m evaluation.eval_conversation

validate-ground-truth:
	uv run python -m evaluation.validate_ground_truth

validate-sources:
	uv run python -c 'from app.provenance import validate_source_manifest; import json; print(json.dumps(validate_source_manifest(), indent=2)); raise SystemExit(0 if validate_source_manifest()["valid"] else 1)'

refresh-history:
	uv run python -m ingestion.historical

export-review:
	uv run python -m evaluation.review_ground_truth --export evaluation/ground_truth_review.csv

index:
	uv run python -m ingestion.build_index

run:
	uv run uvicorn app.api:app --host 0.0.0.0 --port $${PORT:-8502}

up:
	@test -f .env || cp .env.example .env
	docker compose up --build -d

down:
	docker compose down

smoke:
	@curl --fail --silent http://localhost:8000/health
	@curl --fail --silent http://localhost:8502/health
	@curl --fail --silent http://localhost:3000/api/health
	@curl --fail --silent http://localhost:6333/healthz

compose-up: up
