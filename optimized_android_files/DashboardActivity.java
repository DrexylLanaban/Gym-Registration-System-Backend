package com.example.gymregistrationsystem.activities;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.example.gymregistrationsystem.R;
import com.example.gymregistrationsystem.api.ApiResponse;
import com.example.gymregistrationsystem.api.RetrofitClient;
import com.example.gymregistrationsystem.databinding.ActivityDashboardBinding;
import com.example.gymregistrationsystem.models.DashboardStats;
import com.example.gymregistrationsystem.utils.AppUtils;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class DashboardActivity extends AppCompatActivity {

    private ActivityDashboardBinding binding;
    private Handler refreshHandler;
    private boolean isDestroyed = false;
    private static final long DASHBOARD_REFRESH_INTERVAL = 30 * 1000; // 30 seconds
    private static final long CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    private DashboardStats cachedStats;
    private long lastCacheTime = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityDashboardBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        // Initialize handler
        refreshHandler = new Handler(Looper.getMainLooper());

        setupUI();
        setupClickListeners();
        
        // Load initial data
        loadDashboardData();
        
        // Start periodic refresh
        startPeriodicRefresh();
    }

    private void setupUI() {
        // Set user info
        SharedPreferences prefs = getSharedPreferences("user_prefs", MODE_PRIVATE);
        String userName = prefs.getString("user_name", "User");
        String userRole = prefs.getString("user_role", "member");
        
        binding.tvWelcome.setText("Welcome, " + userName);
        
        // Set role-specific UI
        if (userRole.equals("admin")) {
            binding.tvUserRole.setText("Administrator");
            binding.tvUserRole.setTextColor(getResources().getColor(R.color.secondary));
        } else {
            binding.tvUserRole.setText("Member");
            binding.tvUserRole.setTextColor(getResources().getColor(R.color.text_secondary));
        }
    }

    private void setupClickListeners() {
        // Member list with status filter
        binding.cardMembers.setOnClickListener(v -> {
            Intent intent = new Intent(this, MemberListActivity.class);
            intent.putExtra("initial_status", "active"); // Show active members by default
            startActivity(intent);
        });

        // Trainers list
        binding.cardTrainers.setOnClickListener(v -> {
            Intent intent = new Intent(this, TrainerListActivity.class);
            startActivity(intent);
        });

        // Payments
        binding.cardPayments.setOnClickListener(v -> {
            Intent intent = new Intent(this, PaymentListActivity.class);
            startActivity(intent);
        });

        // Attendance
        binding.cardAttendance.setOnClickListener(v -> {
            Intent intent = new Intent(this, AttendanceActivity.class);
            startActivity(intent);
        });

        // Performance Reports
        binding.cardReports.setOnClickListener(v -> {
            Intent intent = new Intent(this, PerformanceReportsActivity.class);
            startActivity(intent);
        });

        // Profile
        binding.cardProfile.setOnClickListener(v -> {
            Intent intent = new Intent(this, ProfileActivity.class);
            startActivity(intent);
        });

        // Refresh button
        binding.btnRefresh.setOnClickListener(v -> {
            loadDashboardData(true); // Force refresh
        });
    }

    private void loadDashboardData() {
        loadDashboardData(false);
    }

    private void loadDashboardData(boolean forceRefresh) {
        // Check cache first (unless forcing refresh)
        long currentTime = System.currentTimeMillis();
        if (!forceRefresh && cachedStats != null && (currentTime - lastCacheTime) < CACHE_DURATION) {
            updateUI(cachedStats);
            return;
        }

        showLoading(true);

        // Use optimized API call with caching
        RetrofitClient.getInstance(this).getApiService()
            .getDashboardStats()
            .enqueue(new Callback<ApiResponse<DashboardStats>>() {
                @Override
                public void onResponse(Call<ApiResponse<DashboardStats>> call,
                                       Response<ApiResponse<DashboardStats>> response) {
                    if (isDestroyed) return;

                    showLoading(false);

                    if (response.isSuccessful() && response.body() != null) {
                        ApiResponse<DashboardStats> apiResponse = response.body();
                        
                        if (apiResponse.isSuccess() && apiResponse.getData() != null) {
                            DashboardStats stats = apiResponse.getData();
                            
                            // Cache the response
                            cachedStats = stats;
                            lastCacheTime = currentTime;
                            
                            // Update UI
                            updateUI(stats);
                            
                            // Show if data was cached
                            if (apiResponse.getData().getCached() != null && apiResponse.getData().getCached()) {
                                AppUtils.showInfo(binding.getRoot(), "Using cached data");
                            }
                        } else {
                            showError("Failed to load dashboard data: " + apiResponse.getMessage());
                            // Try to use cached data if available
                            if (cachedStats != null) {
                                updateUI(cachedStats);
                                AppUtils.showInfo(binding.getRoot(), "Using cached data");
                            }
                        }
                    } else {
                        showError("Server error: " + response.code());
                        // Try to use cached data if available
                        if (cachedStats != null) {
                            updateUI(cachedStats);
                            AppUtils.showInfo(binding.getRoot(), "Using cached data");
                        }
                    }
                }

                @Override
                public void onFailure(Call<ApiResponse<DashboardStats>> call, Throwable t) {
                    if (isDestroyed) return;

                    showLoading(false);
                    
                    String errorMsg = "Network error";
                    if (t.getMessage() != null) {
                        errorMsg += ": " + t.getMessage();
                    }
                    showError(errorMsg);
                    
                    // Try to use cached data if available
                    if (cachedStats != null) {
                        updateUI(cachedStats);
                        AppUtils.showInfo(binding.getRoot(), "Using cached data");
                    }
                }
            });
    }

    private void updateUI(DashboardStats stats) {
        // Update member counts with animations
        updateStatWithAnimation(binding.tvTotalMembers, stats.getTotalMembers());
        updateStatWithAnimation(binding.tvActiveMembers, stats.getActiveMembers());
        updateStatWithAnimation(binding.tvInactiveMembers, stats.getInactiveMembers());
        updateStatWithAnimation(binding.tvExpiredMembers, stats.getExpiredMembers());

        // Update trainer counts
        updateStatWithAnimation(binding.tvTotalTrainers, stats.getTotalTrainers());
        updateStatWithAnimation(binding.tvActiveTrainers, stats.getActiveTrainers());

        // Update financial data
        binding.tvMonthlyIncome.setText("₱" + String.format("%,.2f", stats.getMonthlyIncome()));

        // Update attendance
        updateStatWithAnimation(binding.tvTodayAttendance, stats.getTodayAttendance());

        // Update last refresh time
        binding.tvLastRefresh.setText("Last updated: " + android.text.format.DateFormat.format("hh:mm a", new java.util.Date()));
    }

    private void updateStatWithAnimation(TextView textView, int value) {
        // Simple animation for number updates
        textView.setText(String.valueOf(value));
        textView.animate()
            .scaleX(1.1f)
            .scaleY(1.1f)
            .setDuration(200)
            .withEndAction(() -> {
                textView.animate()
                    .scaleX(1.0f)
                    .scaleY(1.0f)
                    .setDuration(200)
                    .start();
            })
            .start();
    }

    private void startPeriodicRefresh() {
        refreshHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!isDestroyed) {
                    loadDashboardData();
                    refreshHandler.postDelayed(this, DASHBOARD_REFRESH_INTERVAL);
                }
            }
        }, DASHBOARD_REFRESH_INTERVAL);
    }

    private void showLoading(boolean loading) {
        binding.progressBar.setVisibility(loading ? View.VISIBLE : View.GONE);
        binding.btnRefresh.setEnabled(!loading);
        
        if (loading) {
            // Dim the cards during loading
            binding.cardMembers.setAlpha(0.7f);
            binding.cardTrainers.setAlpha(0.7f);
            binding.cardPayments.setAlpha(0.7f);
            binding.cardAttendance.setAlpha(0.7f);
            binding.cardReports.setAlpha(0.7f);
        } else {
            // Restore card opacity
            binding.cardMembers.setAlpha(1.0f);
            binding.cardTrainers.setAlpha(1.0f);
            binding.cardPayments.setAlpha(1.0f);
            binding.cardAttendance.setAlpha(1.0f);
            binding.cardReports.setAlpha(1.0f);
        }
    }

    private void showError(String message) {
        AppUtils.showError(binding.getRoot(), message);
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Refresh data when activity resumes
        loadDashboardData();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        isDestroyed = true;
        
        // Cancel periodic refresh
        if (refreshHandler != null) {
            refreshHandler.removeCallbacksAndMessages(null);
        }
        
        // Clear image cache
        try {
            com.bumptech.glide.Glide.with(this).clearMemoryCache();
        } catch (Exception e) {
            // Ignore cleanup errors
        }
    }

    @Override
    public void onBackPressed() {
        // Handle back press - confirm exit
        if (System.currentTimeMillis() - lastBackPressedTime < 2000) {
            super.onBackPressed();
            finish();
        } else {
            lastBackPressedTime = System.currentTimeMillis();
            AppUtils.showInfo(binding.getRoot(), "Press back again to exit");
        }
    }

    private long lastBackPressedTime = 0;
}
