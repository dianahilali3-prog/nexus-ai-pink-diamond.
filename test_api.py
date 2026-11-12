import unittest
from fastapi.testclient import TestClient
from app.main import app

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

    def test_chat_rejects_empty_message_content(self):
        response = self.client.post('/v1/chat', json={'messages': [{'role': 'user', 'content': ''}]})
        self.assertEqual(response.status_code, 422)

    def test_chat_rejects_invalid_role(self):
        response = self.client.post('/v1/chat', json={'messages': [{'role': 'tool', 'content': 'hello'}]})
        self.assertEqual(response.status_code, 422)

if __name__ == '__main__':
    unittest.main()
