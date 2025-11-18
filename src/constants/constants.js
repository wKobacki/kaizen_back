const global_roles = {
    admin: 0,
    country_director: 1,
    user: 2
}

const human_resources = {
    head: 0,
    member: 1
};

const it = {
    head: 0,
    wms_specialist: 1,
    infra_team: 2,
    it_engineer: 3,
    tms_specialist: 4,
    project_manager: 5
};

const engineering = {
    head: 0,
    engineer: 1
};

const facilities = {
    head: 0,
    leader: 1
};

const operations = {
    head: 0,
    operations_manager: 1,
    member: 2,
    administration: 3
};

const sales = {
    head: 0,
    member: 1
};

const transportation = {
    head: 0,
    country_forwarder: 1,
    international_forwarder: 2,
    fleet_manager: 3,
    member: 4
};

const finance = {
    head: 0,
    member: 1
};

const key_account_manager = {
    head: 0,
    read_write: 1,
    read_only: 2
};

const controlling = {
    head: 0,
    business_analyst: 1
};

module.exports = {
    roles: {
        global: global_roles,
        departments: {
            human_resources,
            it,
            engineering,
            facilities,
            operations,
            sales,
            transportation,
            finance,
            key_account_manager,
            controlling,
        }
    }
};