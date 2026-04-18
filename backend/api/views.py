from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Attendance
from .serializers import AttendanceSerializer

@api_view(['GET', 'POST'])
def attendance_list(request):
    if request.method == 'GET':
        attendances = Attendance.objects.all().order_by('-date', '-timestamp')
        # Normalize keys for frontend
        data = [{
            "id": r.employee_id,
            "name": r.name,
            "dept": r.dept,
            "date": r.date,
            "logint": r.login_time,
            "logoutt": r.logout_time,
            "hours": r.hours,
            "extrahours": r.extra_hours,
            "tasks": r.tasks,
            "status": r.status
        } for r in attendances]
        return Response(data)

    elif request.method == 'POST':
        # Manually handling the upsert logic as per the frontend requirement
        employee_id = request.data.get('id')
        date = request.data.get('date')
        
        try:
            instance = Attendance.objects.get(employee_id=employee_id, date=date)
            # Update
            instance.login_time = request.data.get('loginT', instance.login_time)
            instance.logout_time = request.data.get('logoutT', instance.logout_time)
            instance.hours = request.data.get('hours', instance.hours)
            instance.extra_hours = request.data.get('extraHours', instance.extra_hours)
            instance.tasks = request.data.get('tasks', instance.tasks)
            instance.status = request.data.get('status', instance.status)
            instance.save()
            return Response({"message": "Record updated"}, status=status.HTTP_200_OK)
        except Attendance.DoesNotExist:
            # Create
            new_record = Attendance(
                employee_id=employee_id,
                name=request.data.get('name'),
                dept=request.data.get('dept'),
                date=date,
                login_time=request.data.get('loginT'),
                logout_time=request.data.get('logoutT', '—'),
                hours=request.data.get('hours', '—'),
                extra_hours=request.data.get('extraHours', '—'),
                tasks=request.data.get('tasks', '—'),
                status=request.data.get('status')
            )
            new_record.save()
            return Response({"message": "Record saved"}, status=status.HTTP_201_CREATED)
