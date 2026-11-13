import os
import unittest

os.environ.setdefault("OPENAI_BASE_URL", "http://127.0.0.1:9/v1")  # port fermé : aucun appel réel

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


class ApiContractTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_reports_unconfigured_media_engines(self):
        response = self.client.get('/health')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'ok')
        self.assertEqual(data['image_engine'], 'not_configured')
        self.assertEqual(data['video_engine'], 'not_configured')

    def test_models_lists_configured_model(self):
        data = self.client.get('/v1/models').json()
        self.assertEqual(data['object'], 'list')
        self.assertTrue(data['data'][0]['id'])

    def test_chat_rejects_empty_message_content(self):
        response = self.client.post('/v1/chat', json={'messages': [{'role': 'user', 'content': ''}]})
        self.assertEqual(response.status_code, 422)

    def test_chat_rejects_invalid_role(self):
        response = self.client.post('/v1/chat', json={'messages': [{'role': 'tool', 'content': 'hello'}]})
        self.assertEqual(response.status_code, 422)

    def test_unreachable_provider_returns_503(self):
        response = self.client.post('/v1/chat/completions', json={'messages': [{'role': 'user', 'content': 'Bonjour'}]})
        self.assertEqual(response.status_code, 503)

    def test_streaming_reports_unreachable_provider_as_sse_error(self):
        response = self.client.post('/v1/chat/completions', json={'stream': True, 'messages': [{'role': 'user', 'content': 'Bonjour'}]})
        self.assertEqual(response.status_code, 200)
        self.assertIn('error', response.text)


if __name__ == '__main__':
    unittest.main()
