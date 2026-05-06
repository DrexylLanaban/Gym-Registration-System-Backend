package com.example.gymregistrationsystem.activities;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;

import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;

import com.example.gymregistrationsystem.R;
import com.example.gymregistrationsystem.adapters.TrainerAdapter;
import com.example.gymregistrationsystem.api.ApiResponse;
import com.example.gymregistrationsystem.api.RetrofitClient;
import com.example.gymregistrationsystem.databinding.ActivityTrainerListBinding;
import com.example.gymregistrationsystem.models.Trainer;
import com.example.gymregistrationsystem.utils.AppUtils;

import java.util.ArrayList;
import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class TrainerListActivity extends AppCompatActivity implements TrainerAdapter.OnTrainerClickListener {

    private ActivityTrainerListBinding binding;
    private TrainerAdapter adapter;
    private boolean isLoading = false;
    private final Handler searchHandler = new Handler(Looper.getMainLooper());
    private Runnable searchRunnable;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityTrainerListBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        setupToolbar();
        setupRecyclerView();
        setupSearch();
        setupFab();
        setupSwipeRefresh();

        loadTrainers();
    }

    private void setupToolbar() {
        setSupportActionBar(binding.toolbar);
        if (getSupportActionBar() != null) {
            getSupportActionBar().setDisplayHomeAsUpEnabled(true);
            getSupportActionBar().setTitle("TRAINERS");
        }
        binding.toolbar.setNavigationOnClickListener(v -> finish());
    }

    private void setupRecyclerView() {
        adapter = new TrainerAdapter(this, this);
        
        // Optimize RecyclerView performance
        LinearLayoutManager layoutManager = new LinearLayoutManager(this);
        binding.recyclerView.setLayoutManager(layoutManager);
        binding.recyclerView.setAdapter(adapter);
        
        // Performance optimizations
        binding.recyclerView.setHasFixedSize(true);
        binding.recyclerView.setItemViewCacheSize(20);
        binding.recyclerView.setDrawingCacheEnabled(true);
        binding.recyclerView.setDrawingCacheQuality(View.DRAWING_CACHE_QUALITY_HIGH);
    }

    private void setupSearch() {
        // Debounce search to avoid excessive API calls (500ms delay)
        searchRunnable = new Runnable() {
            @Override
            public void run() {
                String searchQuery = binding.etSearch.getText().toString().trim();
                loadTrainers(searchQuery);
            }
        };

        binding.etSearch.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {}

            @Override
            public void afterTextChanged(Editable s) {
                // Remove previous search callback
                searchHandler.removeCallbacks(searchRunnable);
                // Add new callback with debounce delay
                searchHandler.postDelayed(searchRunnable, 500);
            }
        });
    }

    private void setupFab() {
        binding.fabAddTrainer.setOnClickListener(v ->
                startActivity(new Intent(this, AddEditTrainerActivity.class)));
    }

    private void setupSwipeRefresh() {
        binding.swipeRefresh.setOnRefreshListener(this::loadTrainers);
        binding.swipeRefresh.setColorSchemeColors(getResources().getColor(R.color.secondary));
    }

    private void loadTrainers() {
        loadTrainers("");
    }

    private void loadTrainers(String search) {
        if (isLoading) return; // Prevent duplicate API calls
        
        isLoading = true;
        
        // Show loading state only if not already refreshing
        if (!binding.swipeRefresh.isRefreshing()) {
            showLoading(true);
        }
        
        // Use optimized API call
        RetrofitClient.getInstance(this).getApiService()
                .getTrainers(search)
                .enqueue(new Callback<ApiResponse<List<Trainer>>>() {
                    @Override
                    public void onResponse(Call<ApiResponse<List<Trainer>>> call,
                                           Response<ApiResponse<List<Trainer>>> response) {
                        isLoading = false;
                        
                        // Hide loading states
                        if (!binding.swipeRefresh.isRefreshing()) {
                            showLoading(false);
                        }
                        binding.swipeRefresh.setRefreshing(false);
                        
                        if (response.isSuccessful() && response.body() != null) {
                            ApiResponse<List<Trainer>> apiResponse = response.body();
                            
                            if (apiResponse.isSuccess() && apiResponse.getData() != null) {
                                List<Trainer> trainers = apiResponse.getData();
                                
                                // Use optimized submitList for smooth updates
                                adapter.submitList(trainers);
                                
                                // Show empty state if needed
                                showEmpty(trainers.isEmpty());
                                
                                // Log success for debugging
                                AppUtils.showSuccess(binding.getRoot(), 
                                        "Loaded " + trainers.size() + " trainers");
                            } else {
                                // Handle API error
                                showEmpty(true);
                                AppUtils.showError(binding.getRoot(), 
                                        apiResponse.getMessage() != null ? apiResponse.getMessage() : "Failed to load trainers");
                            }
                        } else {
                            // Handle HTTP error
                            showEmpty(true);
                            String errorMsg = "Server error: " + response.code();
                            if (response.errorBody() != null) {
                                errorMsg += " - " + response.message();
                            }
                            AppUtils.showError(binding.getRoot(), errorMsg);
                        }
                    }

                    @Override
                    public void onFailure(Call<ApiResponse<List<Trainer>>> call, Throwable t) {
                        isLoading = false;
                        
                        // Hide loading states
                        if (!binding.swipeRefresh.isRefreshing()) {
                            showLoading(false);
                        }
                        binding.swipeRefresh.setRefreshing(false);
                        
                        // Show empty state and error
                        showEmpty(true);
                        
                        // Detailed error logging
                        String errorMsg = "Network error";
                        if (t.getMessage() != null) {
                            errorMsg += ": " + t.getMessage();
                        }
                        AppUtils.showError(binding.getRoot(), errorMsg);
                        
                        // Log the error for debugging
                        t.printStackTrace();
                    }
                });
    }

    private void showLoading(boolean loading) {
        binding.progressBar.setVisibility(loading ? View.VISIBLE : View.GONE);
        if (loading) {
            binding.recyclerView.setVisibility(View.GONE);
            binding.layoutEmpty.setVisibility(View.GONE);
        }
    }

    private void showEmpty(boolean empty) {
        binding.layoutEmpty.setVisibility(empty ? View.VISIBLE : View.GONE);
        binding.recyclerView.setVisibility(empty ? View.GONE : View.VISIBLE);
        
        // Update empty state message
        if (empty) {
            String searchQuery = binding.etSearch.getText().toString().trim();
            if (!searchQuery.isEmpty()) {
                binding.tvEmptyMessage.setText("No trainers found for \"" + searchQuery + "\"");
            } else {
                binding.tvEmptyMessage.setText("No trainers found");
            }
        }
    }

    @Override
    public void onTrainerClick(Trainer trainer) {
        // FIXED: Navigate to trainer details
        Intent intent = new Intent(this, TrainerDetailActivity.class);
        intent.putExtra("trainer_id", trainer.getId());
        intent.putExtra("trainer_name", trainer.getFullName());
        startActivity(intent);
    }

    @Override
    public void onBookSessionClick(Trainer trainer) {
        // FIXED: Navigate to trainer booking
        Intent intent = new Intent(this, TrainerBookingActivity.class);
        intent.putExtra("trainer_id", trainer.getId());
        intent.putExtra("trainer_name", trainer.getFullName());
        startActivity(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Refresh data when activity resumes
        loadTrainers();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        
        // Clean up handler to prevent memory leaks
        if (searchHandler != null && searchRunnable != null) {
            searchHandler.removeCallbacks(searchRunnable);
        }
        
        // Clear adapter cache
        if (adapter != null) {
            adapter.clearCache();
        }
    }
}
