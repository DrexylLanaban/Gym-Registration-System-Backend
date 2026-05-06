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
import com.example.gymregistrationsystem.adapters.MemberAdapter;
import com.example.gymregistrationsystem.api.ApiResponse;
import com.example.gymregistrationsystem.api.RetrofitClient;
import com.example.gymregistrationsystem.databinding.ActivityMemberListBinding;
import com.example.gymregistrationsystem.models.Member;
import com.example.gymregistrationsystem.utils.AppUtils;

import java.util.ArrayList;
import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class MemberListActivity extends AppCompatActivity implements MemberAdapter.OnMemberClickListener {

    private ActivityMemberListBinding binding;
    private MemberAdapter adapter;
    private String currentFilter = "";
    private String currentStatus = "";
    private boolean isLoading = false;
    private final Handler searchHandler = new Handler(Looper.getMainLooper());
    private Runnable searchRunnable;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityMemberListBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        // Handle initial status from Dashboard
        currentStatus = getIntent().getStringExtra("initial_status");
        if (currentStatus == null) currentStatus = "";

        setupToolbar();
        setupRecyclerView();
        setupSearch();
        setupFilters();
        setupFab();
        setupSwipeRefresh();

        loadMembers();
    }

    private void setupToolbar() {
        setSupportActionBar(binding.toolbar);
        if (getSupportActionBar() != null) {
            getSupportActionBar().setDisplayHomeAsUpEnabled(true);
            getSupportActionBar().setTitle("DISCIPLES");
        }
        binding.toolbar.setNavigationOnClickListener(v -> finish());
    }

    private void setupRecyclerView() {
        adapter = new MemberAdapter(this, this);
        
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
                String newFilter = binding.etSearch.getText().toString().trim();
                if (!currentFilter.equals(newFilter)) {
                    currentFilter = newFilter;
                    loadMembers();
                }
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

    private void setupFilters() {
        // Set initial chip state
        if (currentStatus.equals("active")) {
            binding.chipActive.setChecked(true);
        } else if (currentStatus.equals("inactive")) {
            binding.chipInactive.setChecked(true);
        } else if (currentStatus.equals("expired")) {
            binding.chipExpired.setChecked(true);
        } else {
            binding.chipAll.setChecked(true);
        }

        binding.chipGroupFilters.setOnCheckedStateChangeListener((group, checkedIds) -> {
            if (checkedIds.isEmpty()) return;
            
            int id = checkedIds.get(0);
            String newStatus = "";
            
            if (id == R.id.chipAll) {
                newStatus = "";
            } else if (id == R.id.chipActive) {
                newStatus = "active";
            } else if (id == R.id.chipInactive) {
                newStatus = "inactive";
            } else if (id == R.id.chipExpired) {
                newStatus = "expired";
            }
            
            if (!currentStatus.equals(newStatus)) {
                currentStatus = newStatus;
                loadMembers();
            }
        });
    }

    private void setupFab() {
        binding.fabAddMember.setOnClickListener(v ->
                startActivity(new Intent(this, AddEditMemberActivity.class)));
    }

    private void setupSwipeRefresh() {
        binding.swipeRefresh.setOnRefreshListener(this::loadMembers);
        binding.swipeRefresh.setColorSchemeColors(getResources().getColor(R.color.secondary));
    }

    private void loadMembers() {
        if (isLoading) return; // Prevent duplicate API calls
        
        isLoading = true;
        
        // Show loading state only if not already refreshing
        if (!binding.swipeRefresh.isRefreshing()) {
            showLoading(true);
        }
        
        // Use optimized API call with proper error handling
        RetrofitClient.getInstance(this).getApiService()
                .getMembers(currentFilter, currentStatus, 1, 100)
                .enqueue(new Callback<ApiResponse<List<Member>>>() {
                    @Override
                    public void onResponse(Call<ApiResponse<List<Member>>> call,
                                           Response<ApiResponse<List<Member>>> response) {
                        isLoading = false;
                        
                        // Hide loading states
                        if (!binding.swipeRefresh.isRefreshing()) {
                            showLoading(false);
                        }
                        binding.swipeRefresh.setRefreshing(false);
                        
                        if (response.isSuccessful() && response.body() != null) {
                            ApiResponse<List<Member>> apiResponse = response.body();
                            
                            if (apiResponse.isSuccess() && apiResponse.getData() != null) {
                                List<Member> members = apiResponse.getData();
                                
                                // Use optimized submitList for smooth updates
                                adapter.submitList(members);
                                
                                // Show empty state if needed
                                showEmpty(members.isEmpty());
                                
                                // Log success for debugging
                                AppUtils.showSuccess(binding.getRoot(), 
                                        "Loaded " + members.size() + " members");
                            } else {
                                // Handle API error
                                showEmpty(true);
                                AppUtils.showError(binding.getRoot(), 
                                        apiResponse.getMessage() != null ? apiResponse.getMessage() : "Failed to load members");
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
                    public void onFailure(Call<ApiResponse<List<Member>>> call, Throwable t) {
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
        
        // Update empty state message based on current filter
        if (empty) {
            if (!currentFilter.isEmpty()) {
                binding.tvEmptyMessage.setText("No members found for \"" + currentFilter + "\"");
            } else if (!currentStatus.isEmpty()) {
                binding.tvEmptyMessage.setText("No " + currentStatus + " members found");
            } else {
                binding.tvEmptyMessage.setText("No members found");
            }
        }
    }

    @Override
    public void onMemberClick(Member member) {
        Intent intent = new Intent(this, MemberDetailActivity.class);
        intent.putExtra("member_id", member.getId());
        startActivity(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Refresh data when activity resumes
        loadMembers();
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
