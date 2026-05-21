from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth.models import User
from .models import EmployeeGroup, Profile

class APIChecksTestCase(APITestCase):
 
  def setUp(self):
   # Create a test user and profile for messages testing
    self.user = User.objects.create_user(username='testuser', password='password123')
    self.profile = Profile.objects.create(user=self.user, employee_id='BG000169')

    # Create a test group
    self.group = EmployeeGroup.objects.create(name='Test Group')
          
    def test_health_check(self):
        """Test the health check endpoint returns 200 OK."""
        response = self.client.get('/api/v1/health/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        def test_groups_list(self):
            """Test the groups endpoint returns correctly."""
            response = self.client.get('/api/v1/groups/')
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        def test_attendance_list(self):
            """Test the attendance list endpoint returns correctly."""
            response = self.client.get('/api/v1/attendance/')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
    
        def test_messages_list(self):
            """Test fetching messages between two users."""
            response = self.client.get('/api/v1/messages/', {'user1': 'admin', 'user2': 'BG000169'})
            self.assertEqual(response.status_code, status.HTTP_200_OK)