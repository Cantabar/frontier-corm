#[test_only]
module assembly_metadata::assembly_metadata_tests;

use std::string::utf8;
use sui::test_scenario as ts;
use world::access::OwnerCap;
use world::test_helpers::{Self, admin, user_a, user_b, TestObject};
use corm_auth::corm_auth;
use assembly_metadata::assembly_metadata;

// === Helpers ===

fun setup(ts: &mut ts::Scenario): ID {
    // Initialize world (creates AdminACL, GovernorCap, adds sponsors)
    test_helpers::setup_world(ts);
    // Create a test object and OwnerCap for user_a
    test_helpers::create_test_object(ts, user_a())
}

// === Tests ===

#[test]
fun test_create_metadata() {
    let mut ts = ts::begin(admin());
    let object_id = setup(&mut ts);

    ts::next_tx(&mut ts, user_a());
    {
        let mut registry = assembly_metadata::create_registry_for_testing(ts.ctx());
        let owner_cap = ts::take_from_sender<OwnerCap<TestObject>>(&ts);

        assembly_metadata::create_metadata(
            &mut registry,
            &owner_cap,
            object_id,
            utf8(b"My Refinery"),
            utf8(b"Main ore processing"),
            ts.ctx(),
        );

        assert!(assembly_metadata::has_metadata(&registry, object_id));
        assert!(assembly_metadata::get_name(&registry, object_id) == utf8(b"My Refinery"));
        assert!(assembly_metadata::get_description(&registry, object_id) == utf8(b"Main ore processing"));
        assert!(assembly_metadata::get_owner(&registry, object_id) == user_a());

        ts::return_to_sender(&ts, owner_cap);
        assembly_metadata::destroy_registry_for_testing(registry);
    };

    ts::end(ts);
}

#[test]
fun test_update_metadata() {
    let mut ts = ts::begin(admin());
    let object_id = setup(&mut ts);

    ts::next_tx(&mut ts, user_a());
    {
        let mut registry = assembly_metadata::create_registry_for_testing(ts.ctx());
        let owner_cap = ts::take_from_sender<OwnerCap<TestObject>>(&ts);

        assembly_metadata::create_metadata(
            &mut registry,
            &owner_cap,
            object_id,
            utf8(b"Old Name"),
            utf8(b"Old Desc"),
            ts.ctx(),
        );

        assembly_metadata::update_metadata(
            &mut registry,
            object_id,
            utf8(b"New Name"),
            utf8(b"New Desc"),
            ts.ctx(),
        );

        assert!(assembly_metadata::get_name(&registry, object_id) == utf8(b"New Name"));
        assert!(assembly_metadata::get_description(&registry, object_id) == utf8(b"New Desc"));

        ts::return_to_sender(&ts, owner_cap);
        assembly_metadata::destroy_registry_for_testing(registry);
    };

    ts::end(ts);
}

#[test]
fun test_delete_metadata() {
    let mut ts = ts::begin(admin());
    let object_id = setup(&mut ts);

    ts::next_tx(&mut ts, user_a());
    {
        let mut registry = assembly_metadata::create_registry_for_testing(ts.ctx());
        let owner_cap = ts::take_from_sender<OwnerCap<TestObject>>(&ts);

        assembly_metadata::create_metadata(
            &mut registry,
            &owner_cap,
            object_id,
            utf8(b"Name"),
            utf8(b"Desc"),
            ts.ctx(),
        );

        assembly_metadata::delete_metadata(&mut registry, object_id, ts.ctx());

        assert!(!assembly_metadata::has_metadata(&registry, object_id));

        ts::return_to_sender(&ts, owner_cap);
        assembly_metadata::destroy_registry_for_testing(registry);
    };

    ts::end(ts);
}

#[test]
fun test_admin_cleanup() {
    let mut ts = ts::begin(admin());
    let object_id = setup(&mut ts);

    // Create metadata as user_a
    ts::next_tx(&mut ts, user_a());
    let registry_holder;
    {
        let mut registry = assembly_metadata::create_registry_for_testing(ts.ctx());
        let owner_cap = ts::take_from_sender<OwnerCap<TestObject>>(&ts);

        assembly_metadata::create_metadata(
            &mut registry,
            &owner_cap,
            object_id,
            utf8(b"Name"),
            utf8(b"Desc"),
            ts.ctx(),
        );

        // Admin cleanup (as a different sender — doesn't matter, only cap matters)
        let admin_cap = corm_auth::create_admin_cap_for_testing(ts.ctx());
        assembly_metadata::admin_cleanup(&mut registry, &admin_cap, object_id);

        assert!(!assembly_metadata::has_metadata(&registry, object_id));

        corm_auth::destroy_admin_cap_for_testing(admin_cap);
        ts::return_to_sender(&ts, owner_cap);
        registry_holder = registry;
    };

    assembly_metadata::destroy_registry_for_testing(registry_holder);
    ts::end(ts);
}

#[test]
fun test_admin_cleanup_nonexistent_is_noop() {
    let mut ts = ts::begin(admin());
    setup(&mut ts);

    ts::next_tx(&mut ts, user_a());
    {
        let mut registry = assembly_metadata::create_registry_for_testing(ts.ctx());
        let admin_cap = corm_auth::create_admin_cap_for_testing(ts.ctx());

        // Should not abort — graceful no-op
        let fake_id = object::id_from_address(@0xDEAD);
        assembly_metadata::admin_cleanup(&mut registry, &admin_cap, fake_id);

        corm_auth::destroy_admin_cap_for_testing(admin_cap);
        assembly_metadata::destroy_registry_for_testing(registry);
    };

    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = 5)]
fun test_create_wrong_owner_cap_fails() {
    let mut ts = ts::begin(admin());
    let _object_id = setup(&mut ts);

    // Create a second test object for user_b — user_b gets an OwnerCap for *that* object
    let object_id_b = test_helpers::create_test_object(&mut ts, user_b());

    // user_a tries to create metadata for object_id_b using their OwnerCap (which is for _object_id)
    ts::next_tx(&mut ts, user_a());
    {
        let mut registry = assembly_metadata::create_registry_for_testing(ts.ctx());
        let owner_cap = ts::take_from_sender<OwnerCap<TestObject>>(&ts);

        // owner_cap authorizes _object_id, not object_id_b — should fail
        assembly_metadata::create_metadata(
            &mut registry,
            &owner_cap,
            object_id_b,
            utf8(b"Hacked"),
            utf8(b""),
            ts.ctx(),
        );

        ts::return_to_sender(&ts, owner_cap);
        assembly_metadata::destroy_registry_for_testing(registry);
    };

    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = 0)]
fun test_update_wrong_sender_fails() {
    let mut ts = ts::begin(admin());
    let object_id = setup(&mut ts);

    // Create metadata as user_a
    ts::next_tx(&mut ts, user_a());
    {
        let mut registry = assembly_metadata::create_registry_for_testing(ts.ctx());
        let owner_cap = ts::take_from_sender<OwnerCap<TestObject>>(&ts);

        assembly_metadata::create_metadata(
            &mut registry,
            &owner_cap,
            object_id,
            utf8(b"Name"),
            utf8(b"Desc"),
            ts.ctx(),
        );

        ts::return_to_sender(&ts, owner_cap);

        // Try to update as user_b — should fail
        ts::next_tx(&mut ts, user_b());
        assembly_metadata::update_metadata(
            &mut registry,
            object_id,
            utf8(b"Evil"),
            utf8(b"Hacked"),
            ts.ctx(),
        );

        assembly_metadata::destroy_registry_for_testing(registry);
    };

    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = 1)]
fun test_create_duplicate_fails() {
    let mut ts = ts::begin(admin());
    let object_id = setup(&mut ts);

    ts::next_tx(&mut ts, user_a());
    {
        let mut registry = assembly_metadata::create_registry_for_testing(ts.ctx());
        let owner_cap = ts::take_from_sender<OwnerCap<TestObject>>(&ts);

        assembly_metadata::create_metadata(
            &mut registry,
            &owner_cap,
            object_id,
            utf8(b"First"),
            utf8(b""),
            ts.ctx(),
        );

        // Second create for same assembly — should fail
        assembly_metadata::create_metadata(
            &mut registry,
            &owner_cap,
            object_id,
            utf8(b"Second"),
            utf8(b""),
            ts.ctx(),
        );

        ts::return_to_sender(&ts, owner_cap);
        assembly_metadata::destroy_registry_for_testing(registry);
    };

    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = 3)]
fun test_name_too_long_fails() {
    let mut ts = ts::begin(admin());
    let object_id = setup(&mut ts);

    ts::next_tx(&mut ts, user_a());
    {
        let mut registry = assembly_metadata::create_registry_for_testing(ts.ctx());
        let owner_cap = ts::take_from_sender<OwnerCap<TestObject>>(&ts);

        // 65 bytes — exceeds MAX_NAME_BYTES (64)
        let long_name = utf8(b"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");

        assembly_metadata::create_metadata(
            &mut registry,
            &owner_cap,
            object_id,
            long_name,
            utf8(b""),
            ts.ctx(),
        );

        ts::return_to_sender(&ts, owner_cap);
        assembly_metadata::destroy_registry_for_testing(registry);
    };

    ts::end(ts);
}
